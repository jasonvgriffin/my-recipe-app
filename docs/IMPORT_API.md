# Recipe Import API (`src/import/`)

**One function gets recipes into the app:** `importRecipe(input, options?, deps?)`.
Every entry point must call it — never write imported recipes to storage directly:

| Entry point                                                         | Status                              | Adapter                                                                     |
| ------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| In-app "Import from link" (spec #1)                                 | ✅ `src/app/import.tsx`             | `{ kind: 'url', url, source: { channel: 'app-link' } }`                     |
| Paste / dictate text                                                | ✅ same screen                      | `{ kind: 'text', text, source: { channel: 'app-text' } }`                   |
| Deep link `myrecipeapp://import?url=…` / `?text=…`                  | ✅ route shows a draft              | `parseImportDeepLink(link)`                                                 |
| Android share sheet → app (SEND `text/plain`)                       | ✅ `expo-sharing` + `+native-intent` | `shareTextToImportInput(sharedText)`                                        |
| Android share sheet → app (SEND `application/pdf`, v1.0.6)          | ✅ forwarded to Import PDF          | `sharedPdfUri(payloads)` → `/import-pdf?uri=…`                              |
| **Import PDF** (+ menu, v1.0.6)                                     | ✅ `src/app/import-pdf.tsx`         | `readRecipesFromPdf(bytes, deps)` → one `{ kind: 'text', text, source: { channel: 'pdf' } }` dry run per recipe; `importPdfCandidates(chosen, categoryIds, deps)` saves |
| JSON file import                                                    | later phase                         | `{ kind: 'structured', …, source: { channel: 'file' } }`                    |

The MCP server entry point was **cut in v1.0.6** at Jason's request (may be revisited); the API stays host-agnostic.

The module has **no UI dependencies** (no React / react-native imports, enforced by ESLint) so it can be reused
unchanged by another host (e.g. a server, if one is ever added back); storage, network and clock are injected via `deps`.

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
  channel?: 'app-link' | 'app-text' | 'share-intent' | 'deep-link' | 'file' | 'pdf';
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
  categories?: string[]; // category NAMES; structured imports only: v1.0.6 EVERY name is used (created if missing; a recipe can be in several). URL/text imports ignore page categories → Uncategorized
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
   the import has none, and keeps the existing category (an uncategorized recipe takes the import's); `create` always adds a new one.
6. **Normalize + save**: whitespace collapsed, tags lower-cased, categories resolved to ids (structured: every name; URL/text: none — Uncategorized; plus any `options.categoryIds`), `createRecipe`,
   `store.save`.

## Dependencies (`ImportDeps`)

```ts
interface ImportDeps {
  store: Pick<RecipeStore, 'list' | 'save' | 'addCategory'>; // default: on-device AsyncStorage store
  fetchHtml: (url: string) => Promise<string>; // default: global fetch
  now: () => Date;
}
```

Another host would pass its own store implementing the same three methods.

## Examples

```ts
// Link import UI
const r = await importRecipe({ kind: 'url', url: pasted, source: { channel: 'app-link' } });
if (r.ok) router.push({ pathname: '/recipe/[id]', params: { id: r.recipe.id } });
else Alert.alert('Import failed', r.errors.join('\n'));

// Import PDF: read on the phone, preview, then save the checked ones into categories (several allowed)
const read = await readRecipesFromPdf(bytes, appImportDeps); // { ok:false, reason:'no_text' } for scans
if (read.ok) await importPdfCandidates(read.candidates, [dinnerId, weeknightId], appImportDeps);

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

## Import PDF (v1.0.6)

On-device only (no network, no paid APIs, no new permissions; pure TypeScript, no native PDF library):

- `src/import/pdf/objects.ts` — PDF object parser: xref-free object scan (works on damaged xrefs), object streams,
  Flate (`inflate.ts`, pure TS) / ASCIIHex / ASCII85 filters and PNG predictors, page tree with inherited resources.
- `src/import/pdf/fonts.ts` — ToUnicode CMaps (bfchar / bfrange, 1- and 2-byte codes), WinAnsi / MacRoman /
  Standard encodings + `/Differences`, glyph widths (`/Widths`, CID `/W`).
- `src/import/pdf/extract-text.ts` — content-stream interpreter (text matrices, TJ kerning, `cm`, Form XObjects,
  inline images skipped) and line layout (lines by baseline, spaces from gaps, blank lines between blocks).
  `hasText: false` for scans / image-only PDFs.
- `src/import/pdf/recipes.ts` — `splitRecipeTexts(pages)`: one chunk per “Ingredients” heading; the title block is
  found by walking back past meta lines, never past a page start, a section heading or a “Source:” line.
- `src/import/parsers/text.ts` — the shared text parser now reads descriptions, servings (“Servings: 6”, “Serves 4”,
  “Yield”), prep/cook times (kept in notes), numbered or wrapped steps, the app's own “(40 min)” step timers,
  “Substitution:” notes, Notes and Tags sections and “Source: https://…”.
- Errors: `not_pdf`, `unreadable` (damaged / encrypted), `no_text` (“Couldn’t read text from this PDF …”),
  `no_recipes`, `locked` (the `linkImport` gate). Recipes with monk fruit are listed in `skipped`.
- Tests: `__tests__/import-pdf.test.ts` (app-export round trip from Chrome/Skia-printed fixtures, generated
  Helvetica PDFs via `test-helpers/simple-pdf.ts`, image-only PDF), `__tests__/import-pdf-ui.test.tsx`.

