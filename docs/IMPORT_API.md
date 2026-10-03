# Recipe Import API (`src/import/`)

**One function gets recipes into the app:** `importRecipe(input, options?, deps?)`.
Every entry point must call it — never write imported recipes to storage directly:

| Entry point                                                         | Status                              | Adapter                                                                     |
| ------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| In-app "Import from link" (spec #1)                                 | ✅ `src/app/import.tsx`             | `{ kind: 'url', url, source: { channel: 'app-link' } }`                     |
| Paste / dictate text                                                | ✅ same screen                      | `{ kind: 'text', text, source: { channel: 'app-text' } }`                   |
| Deep link `myrecipeapp://import?url=…` / `?text=…`                  | ✅ route shows a draft              | `parseImportDeepLink(link)`                                                 |
| Android share sheet → app (SEND `text/plain`)                       | ✅ `expo-sharing` + `+native-intent` | `shareTextToImportInput(sharedText)`                                        |
| **Future MCP server** ("Hey AI, send this recipe to my recipe app") | later phase                         | `{ kind: 'structured', recipe, source: { channel: 'mcp', label: 'Grok' } }` |
| Future sync / JSON file import                                      | later phase                         | `{ kind: 'structured', …, source: { channel: 'sync' \| 'file' } }`          |

The module has **no UI dependencies** (no React / react-native imports, enforced by ESLint) so it can be reused
unchanged by a Node MCP server or sync worker; storage, network and clock are injected via `deps`.

- App code: `importRecipe(input, options?, deps = appImportDeps)` from `@/import` (binds the on-device store + fetch).
- Other hosts: `importRecipeWith(deps, input, options?)` from `@/import/import-recipe` (only a _type_ import of
  the store interface; no AsyncStorage).

## Interface

```ts
import { importRecipe } from '@/import';

type RecipeImportInput =
  | { kind: 'url'; url: string; source?: ImportSource } // fetch + parse a web page
  | { kind: 'structured'; recipe: RecipeDraft; source?: ImportSource } // already structured (MCP, JSON)
  | { kind: 'text'; text: string; source?: ImportSource }; // free text (share, dictation)

interface ImportSource {
  url?: string; // original page; kept on the recipe (spec #5) and used for dedupe
  channel?: 'app-link' | 'app-text' | 'share-intent' | 'deep-link' | 'mcp' | 'sync' | 'file';
  label?: string; // e.g. "Grok"
}

interface RecipeDraft {
  // validated with zod (RecipeDraftSchema); unknown keys stripped
  title: string; // required, 1–300 chars
  ingredients?: (string | { text: string; substitutionNote?: string })[]; // parsed into
  // { quantity, quantityMax, unit, name, note } on save (spec #16/#18/#21)
  steps?: (string | { text: string; durationSeconds?: number })[]; // at least one ingredient OR step;
  // timers auto-detected from text when durationSeconds absent (spec #15)
  description?: string;
  tags?: string[]; // lower-cased + deduped
  categories?: string[]; // category NAMES; created if missing (spec #3)
  servings?: number; // > 0; defaults to 1 with a warning
  rating?: number; // 1–5 (spec #22)
  notes?: string;
  photoUrl?: string; // http(s) or file://
  sourceUrl?: string; // http(s)
}

interface ImportOptions {
  onDuplicate?: 'skip' | 'update' | 'create'; // default 'skip'
  dryRun?: boolean; // validate/normalize only, don't save
}

type ImportResult =
  | { ok: true; status: 'created' | 'updated' | 'duplicate'; recipe: Recipe; warnings: string[] }
  | { ok: false; code: ImportErrorCode; errors: string[] };

type ImportErrorCode =
  | 'invalid_input' // input or structured draft failed validation
  | 'forbidden_ingredient' // monk fruit / luo han guo / mogroside — allulose is the only sugar-free sweetener
  | 'fetch_failed' // URL couldn't be downloaded
  | 'no_recipe_found' // page/text had no recognizable recipe
  | 'not_implemented';
```

`importRecipe` never throws for bad input; it returns `{ ok: false, … }`.

## Pipeline

1. **Validate input** (`RecipeImportInputSchema`, zod discriminated union on `kind`).
2. **Produce a draft**
   - `url`: `deps.fetchHtml(url)` → `extractJsonLdRecipe` (schema.org `Recipe` JSON-LD, incl. `@graph`,
     `HowToSection`, `recipeYield`, `keywords`, `recipeCategory`, `image`; schema.org nutrition is ignored — recipe app, not a nutrition app) → fallback
     `extractRecipeHeuristically` (microdata, WP Recipe Maker, Tasty Recipes, then heading + lists)
     when JSON-LD is missing or has no ingredients and no steps. The page URL becomes `sourceUrl`.
   - `text`: `parseRecipeText` (first line = title; "Ingredients" / "Steps|Instructions|Directions" sections).
   - `structured`: used as given.
3. **Validate the draft** (`RecipeDraftSchema`).
4. **House rules**: reject monk fruit (and synonyms) anywhere in title/description/notes/ingredients/steps.
5. **Dedupe by source URL**: `normalizeSourceUrl` (https, lower-case host, no `www.`, no hash, no
   `utm_*`/`fbclid`/… params, sorted query, no trailing slash). Policy `skip` returns the existing recipe
   (`status: 'duplicate'`); `update` replaces content but keeps id, createdAt, cooked history, notes/photo if
   the import has none, and merges categories; `create` always adds a new one.
6. **Normalize + save**: whitespace collapsed, tags lower-cased, categories resolved to ids, `createRecipe`,
   `store.save`.

## Dependencies (`ImportDeps`)

```ts
interface ImportDeps {
  store: Pick<RecipeStore, 'list' | 'save' | 'addCategory'>; // default: on-device AsyncStorage store
  fetchHtml: (url: string) => Promise<string>; // default: global fetch
  now: () => Date;
}
```

A future MCP server would pass a server-side store (e.g. Postgres) implementing the same three methods.

## Examples

```ts
// Link import UI
const r = await importRecipe({ kind: 'url', url: pasted, source: { channel: 'app-link' } });
if (r.ok) router.push({ pathname: '/recipe/[id]', params: { id: r.recipe.id } });
else Alert.alert('Import failed', r.errors.join('\n'));

// Future MCP tool `add_recipe` handler
return importRecipeWith(
  serverDeps,
  { kind: 'structured', recipe: args, source: { channel: 'mcp', label: 'Grok' } },
  { onDuplicate: 'update' },
);

// Deep link / share intent — the import screen previews with dryRun, then saves on confirm.
const input = parseImportDeepLink(url) ?? shareTextToImportInput(sharedText);
await importRecipe(input, { dryRun: true });
```

## Files

```
src/import/index.ts          public API for the app: importRecipe (+ adapters, types)
src/import/types.ts          zod schemas + TS types (the contract)
src/import/import-recipe.ts  importRecipeWith pipeline (portable core, deps required)
src/import/app-deps.ts       on-device deps (AsyncStorage store, fetch, clock)
src/import/normalize.ts      draft → RecipeInput, normalizeSourceUrl
src/import/parsers/json-ld.ts     schema.org Recipe JSON-LD
src/import/parsers/heuristics.ts  HTML fallback (microdata, plugin markup, headings)
src/import/html.ts               tiny HTML parser used by the fallback
src/import/parsers/text.ts        plain text
src/import/deep-link.ts      myrecipeapp://import + share-text adapters
src/import/url.ts            URL helpers (RN's global URL is a partial polyfill — don't rely on it)
__tests__/import.test.ts     contract tests
```

Changing the contract? Update this doc, `types.ts`, and the tests in the same PR.
