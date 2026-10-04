/**
 * MCP tools (Phase 3): recipes, categories/tags, meal plan and shopping list for the caller's household, or their personal space when they have none (v1.0.6).
 * Built on the app's own modules — `importRecipeWith` (the one import pipeline), `applyRecipeEdit`,
 * `filterRecipes`, `compileWeekShoppingList`, `addManualItem` — so validation, the allulose-only rule and URL
 * dedupe are identical to the app. No nutrition tools: this is a recipe app, not a nutrition app.
 */
import { z } from 'zod';

import { importRecipeWith } from '@/import/import-recipe';
import { RecipeDraftSchema } from '@/import/types';
import { addDays, startOfWeek, toIsoDate } from '@/lib/dates';
import { uuid } from '@/lib/ids';
import { applyRecipeEdit } from '@/lib/recipe-edit';
import { filterRecipes, sortRecipes } from '@/lib/recipe-utils';
import { addManualItem, compileWeekShoppingList, shoppingListChanges, shoppingListFromItems } from '@/lib/shopping';
import { isInPantry } from '@/pantry/isInPantry';
import { MEAL_SLOTS, type MealPlanEntry, type ShoppingList, type ShoppingListItem } from '@/types/meal-plan';
import {
  findForbiddenIngredients,
  migrateRecipe,
  validateRecipeInput,
  type Category,
  type PantryItem,
  type Recipe,
  type RecipeInput,
} from '@/types/recipe';

import type { HouseholdRecord, HouseholdRepo } from './repo';

export interface ToolContext {
  repo: HouseholdRepo;
  fetchHtml: (url: string) => Promise<string>;
  now: () => Date;
}

export class ToolError extends Error {}

/** Server-side fetches only go to public http(s) hosts (no localhost, private or link-local addresses). */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')) return false;
  }
  return true;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

const schemas = {
  search_recipes: z.object({
    query: z.string().max(200).optional().describe('Keywords: title, ingredients, steps, notes, tags'),
    tags: z.array(z.string()).max(20).optional().describe('Only recipes with ALL these tags'),
    category: z.string().max(100).optional().describe('Category name'),
    minRating: z.number().int().min(1).max(5).optional(),
    limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
  }),
  get_recipe: z.object({ id: z.string().min(1) }),
  add_recipe: z
    .object({
      url: z.string().url().optional().describe('Recipe web page to import'),
      text: z.string().min(1).max(50000).optional().describe('Recipe as plain text'),
      // Typed (not `unknown`) so strict tool-schema validators in assistants accept it; extra fields pass through
      // to the import pipeline, which validates the draft.
      recipe: z
        .looseObject({
          title: z.string().describe('Recipe title'),
          description: z.string().optional(),
          ingredients: z.array(z.string()).optional().describe('One ingredient per line, e.g. "1 cup almond flour"'),
          steps: z.array(z.string()).optional().describe('One step per entry'),
          servings: z.number().optional(),
          tags: z.array(z.string()).optional(),
          categories: z.array(z.string()).optional(),
          notes: z.string().optional(),
          sourceUrl: z.string().optional(),
        })
        .optional()
        .describe('Structured recipe'),
    })
    .refine((a) => [a.url, a.text, a.recipe].filter((v) => v !== undefined).length === 1, {
      message: 'Provide exactly one of url, text or recipe',
    }),
  update_recipe: z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    servings: z.number().positive().max(1000).optional(),
    ingredients: z.array(z.string().min(1)).min(1).max(500).optional().describe('Full replacement list, one line each'),
    steps: z.array(z.string().min(1)).min(1).max(500).optional().describe('Full replacement list'),
    notes: z.string().max(20000).optional(),
    tags: z.array(z.string()).max(100).optional().describe('Full replacement list'),
    rating: z.number().int().min(1).max(5).nullable().optional().describe('null clears the rating'),
  }),
  list_tags: z.object({}),
  list_categories: z.object({}),
  get_meal_plan: z.object({
    start: isoDate.optional().describe('First day, default today'),
    days: z.number().int().min(1).max(31).optional().describe('Default 7'),
  }),
  plan_meal: z.object({
    date: isoDate,
    recipeId: z.string().min(1),
    slot: z.enum(MEAL_SLOTS as [string, ...string[]]).optional(),
    servings: z.number().positive().max(1000).optional(),
  }),
  get_shopping_list: z.object({ weekStart: isoDate.optional().describe('Monday of the week, default this week') }),
  build_shopping_list: z.object({ weekStart: isoDate.optional().describe('Monday of the week, default this week') }),
  add_shopping_item: z.object({ text: z.string().min(1).max(300), weekStart: isoDate.optional() }),
  check_shopping_item: z.object({ itemId: z.string().min(1), checked: z.boolean() }),
} as const;

export type ToolName = keyof typeof schemas;

const descriptions: Record<ToolName, string> = {
  search_recipes: 'Search the recipe box (the shared household, or your own if you share none). Returns id, title, tags, rating and servings for each match.',
  get_recipe: 'Get one recipe with ingredients, steps, notes, tags and source link.',
  add_recipe:
    'Add a recipe from a URL, plain text, or a structured recipe. Same import pipeline as the app: validated, deduplicated by source link. Allulose is the only sugar-free sweetener; monk fruit is rejected.',
  update_recipe: 'Change a recipe: title, servings, ingredients, steps, notes, tags or rating. Lists replace the old ones.',
  list_tags: 'List all recipe tags.',
  list_categories: 'List recipe categories.',
  get_meal_plan: 'Planned meals for a date range.',
  plan_meal: 'Put a recipe on the meal plan for a day (optional slot and servings).',
  get_shopping_list: 'The shopping list for a week.',
  build_shopping_list:
    "Rebuild a week's shopping list from its meal plan (keeps checked items and manual lines; skips pantry items).",
  add_shopping_item: 'Add a line to the shopping list.',
  check_shopping_item: 'Check or uncheck a shopping list item.',
};

const READ_ONLY = new Set<ToolName>(['search_recipes', 'get_recipe', 'list_tags', 'list_categories', 'get_meal_plan', 'get_shopping_list']);

const titleOf = (name: ToolName) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function toolDefinitions() {
  return (Object.keys(schemas) as ToolName[]).map((name) => {
    const json = z.toJSONSchema(schemas[name], { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete json.$schema;
    const readOnly = READ_ONLY.has(name);
    return {
      name,
      title: titleOf(name),
      description: descriptions[name],
      inputSchema: json,
      // MCP tool annotations (hints for clients deciding how to present / confirm a tool call).
      annotations: { title: titleOf(name), readOnlyHint: readOnly, destructiveHint: false, idempotentHint: readOnly, openWorldHint: name === 'add_recipe' },
    };
  });
}

const asRecipes = (rows: HouseholdRecord[]) => rows.map((r) => migrateRecipe(r)).filter((r): r is Recipe => !!r);

function summary(r: Recipe) {
  return { id: r.id, title: r.title, tags: r.tags, rating: r.rating, servings: r.servings, cooked: r.cooked };
}

function recipeOut(r: Recipe, categories: Category[]) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => i.text),
    steps: r.steps.map((s) => s.text),
    notes: r.notes,
    tags: r.tags,
    categories: r.categoryIds.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean),
    rating: r.rating,
    sourceUrl: r.sourceUrl,
    cooked: r.cooked,
    lastCookedAt: r.lastCookedAt,
  };
}

async function shoppingList(repo: HouseholdRepo, weekStart: string): Promise<ShoppingList | undefined> {
  return shoppingListFromItems(weekStart, (await repo.list('shopping_items')) as unknown as ShoppingListItem[]);
}

/** Same minimal-churn write as `mealPlanStore.saveShoppingList` (shared `shoppingListChanges`). */
async function saveShoppingList(repo: HouseholdRepo, list: ShoppingList) {
  const { save, remove } = shoppingListChanges(list, (await repo.list('shopping_items')) as unknown as ShoppingListItem[]);
  for (const item of save) await repo.save('shopping_items', item as unknown as HouseholdRecord);
  for (const id of remove) await repo.remove('shopping_items', id);
}

const listItemsOut = (list: ShoppingList | undefined) =>
  (list?.items ?? []).map((i) => ({ id: i.id, text: i.text, checked: i.checked, aisle: i.aisle }));

export async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  if (!(name in schemas)) throw new ToolError(`Unknown tool: ${name}`);
  const parsed = schemas[name as ToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  const args = parsed.data as Record<string, unknown>;
  const { repo, now } = ctx;
  const today = () => toIsoDate(now());
  const thisWeek = () => toIsoDate(startOfWeek(now()));
  const categories = async () => (await repo.list('categories')) as unknown as Category[];
  const recipes = async () => asRecipes(await repo.list('recipes'));

  switch (name as ToolName) {
    case 'search_recipes': {
      const cats = await categories();
      let categoryId: string | undefined;
      if (args.category) {
        categoryId = cats.find((c) => c.name.toLowerCase() === String(args.category).trim().toLowerCase())?.id;
        if (!categoryId) return { recipes: [], note: `No category named "${args.category}".` };
      }
      const found = filterRecipes(
        await recipes(),
        {
          keyword: args.query as string | undefined,
          tags: args.tags as string[] | undefined,
          categoryId,
          minRating: args.minRating as number | undefined,
        },
        now(),
      );
      return { recipes: sortRecipes(found, 'title').slice(0, (args.limit as number) ?? 20).map(summary), total: found.length };
    }
    case 'get_recipe': {
      const r = (await recipes()).find((x) => x.id === args.id);
      if (!r) throw new ToolError('Recipe not found.');
      return recipeOut(r, await categories());
    }
    case 'add_recipe': {
      const store = {
        list: recipes,
        save: async (r: Recipe) => (await repo.save('recipes', r as unknown as HouseholdRecord)) as unknown as Recipe,
        addCategory: async (catName: string) => {
          const trimmed = catName.trim();
          const existing = (await categories()).find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
          if (existing) return existing;
          const ts = now().toISOString();
          return (await repo.save('categories', { id: uuid(), name: trimmed, createdAt: ts, updatedAt: ts })) as unknown as Category;
        },
      };
      if (args.url && !isPublicHttpUrl(args.url as string)) throw new ToolError('invalid_input: url must be a public http(s) address.');
      const source = { channel: 'mcp' as const, label: 'AI assistant (MCP)' };
      const input = args.url
        ? { kind: 'url' as const, url: args.url as string, source }
        : args.text
          ? { kind: 'text' as const, text: args.text as string, source }
          : { kind: 'structured' as const, recipe: args.recipe as z.input<typeof RecipeDraftSchema>, source };
      const result = await importRecipeWith({ store, fetchHtml: ctx.fetchHtml, now }, input);
      if (!result.ok) throw new ToolError(`${result.code}: ${result.errors.join('; ')}`);
      return { status: result.status, warnings: result.warnings, recipe: recipeOut(result.recipe, await categories()) };
    }
    case 'update_recipe': {
      const original = (await recipes()).find((x) => x.id === args.id);
      if (!original) throw new ToolError('Recipe not found.');
      const input: RecipeInput = {
        title: (args.title as string) ?? original.title,
        description: (args.description as string) ?? original.description,
        servings: (args.servings as number) ?? original.servings,
        ingredients: args.ingredients ? (args.ingredients as string[]).map((text) => ({ text })) : original.ingredients,
        steps: args.steps ? (args.steps as string[]).map((text) => ({ text })) : original.steps,
        notes: (args.notes as string) ?? original.notes,
        tags: (args.tags as string[] | undefined)?.map((t) => t.trim().toLowerCase()).filter(Boolean) ?? original.tags,
        rating: args.rating === null ? undefined : ((args.rating as number) ?? original.rating),
        categoryIds: original.categoryIds,
        photoUri: original.photoUri,
        sourceUrl: original.sourceUrl,
        unitSystem: original.unitSystem,
      };
      const forbidden = findForbiddenIngredients(input);
      if (forbidden.length) throw new ToolError(`forbidden_ingredient: ${forbidden.join(', ')} (use allulose instead)`);
      const v = validateRecipeInput(input);
      if (!v.ok) throw new ToolError(v.errors.join(' '));
      const next = applyRecipeEdit(original, input, now());
      if (args.rating === null) delete next.rating;
      const saved = (await repo.save('recipes', next as unknown as HouseholdRecord)) as unknown as Recipe;
      return recipeOut(saved, await categories());
    }
    case 'list_tags':
      return { tags: [...new Set((await recipes()).flatMap((r) => r.tags))].sort() };
    case 'list_categories':
      return { categories: (await categories()).map((c) => c.name).sort((a, b) => a.localeCompare(b)) };
    case 'get_meal_plan': {
      const start = (args.start as string) ?? today();
      const days = (args.days as number) ?? 7;
      const end = addDays(start, days - 1);
      const byId = new Map((await recipes()).map((r) => [r.id, r] as const));
      const entries = ((await repo.list('meal_plan_entries')) as unknown as MealPlanEntry[])
        .filter((e) => e.date >= start && e.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.slot ?? '').localeCompare(b.slot ?? ''));
      return {
        start,
        end,
        meals: entries.map((e) => ({
          id: e.id,
          date: e.date,
          slot: e.slot,
          servings: e.servings,
          recipeId: e.recipeId,
          title: byId.get(e.recipeId)?.title ?? 'Recipe unavailable',
        })),
      };
    }
    case 'plan_meal': {
      const recipe = (await recipes()).find((r) => r.id === args.recipeId);
      if (!recipe) throw new ToolError('Recipe not found.');
      const ts = now().toISOString();
      const entry: MealPlanEntry = { id: uuid(), date: args.date as string, recipeId: recipe.id, createdAt: ts, updatedAt: ts };
      if (args.slot) entry.slot = args.slot as MealPlanEntry['slot'];
      if (args.servings) entry.servings = args.servings as number;
      await repo.save('meal_plan_entries', entry as unknown as HouseholdRecord);
      return { id: entry.id, date: entry.date, slot: entry.slot, servings: entry.servings, title: recipe.title };
    }
    case 'get_shopping_list': {
      const weekStart = (args.weekStart as string) ?? thisWeek();
      return { weekStart, items: listItemsOut(await shoppingList(repo, weekStart)) };
    }
    case 'build_shopping_list': {
      const weekStart = (args.weekStart as string) ?? thisWeek();
      const previous = await shoppingList(repo, weekStart);
      const entries = (await repo.list('meal_plan_entries')) as unknown as MealPlanEntry[];
      const pantry = (await repo.list('pantry_items')) as unknown as PantryItem[];
      const list = compileWeekShoppingList(weekStart, entries, await recipes(), previous, (key) => isInPantry(key, pantry), now());
      await saveShoppingList(repo, list);
      return { weekStart, items: listItemsOut(list) };
    }
    case 'add_shopping_item': {
      const weekStart = (args.weekStart as string) ?? thisWeek();
      const previous = (await shoppingList(repo, weekStart)) ?? {
        id: `week-${weekStart}`,
        weekStart,
        items: [],
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      };
      const list = addManualItem(previous, args.text as string, now());
      const added = list.items[list.items.length - 1];
      await repo.save('shopping_items', added as unknown as HouseholdRecord);
      return { weekStart, item: { id: added.id, text: added.text, checked: added.checked, aisle: added.aisle } };
    }
    case 'check_shopping_item': {
      const item = ((await repo.list('shopping_items')) as unknown as ShoppingListItem[]).find((i) => i.id === args.itemId);
      if (!item) throw new ToolError('Shopping item not found.');
      await repo.save('shopping_items', { ...item, checked: args.checked as boolean } as unknown as HouseholdRecord);
      return { id: item.id, text: item.text, checked: args.checked };
    }
  }
}
