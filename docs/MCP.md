# AI assistant access (remote MCP server)

Ask Grok, Claude, ChatGPT or another MCP client to find, add and edit recipes, plan meals and manage the
shopping list. Changes land in your synced data (your personal space, or your household's if you share one) and
show up in the app on its next sync.
This feature is in v1.0 (approved by Jason, Oct 3 2026).

**Server URL:** `https://krqmumdgsfimasjawxqn.supabase.co/functions/v1/mcp`

## Before you connect

1. In the app, open **Settings → AI assistants (MCP) → Sign in to sync and use with AI assistants** and sign in
   with your email code. **No household needed** (v1.0.6). Household sharing (More → Household) is separate and
   optional.
2. Let the app sync once, so your recipes are in Supabase. The assistant sees your synced data: your personal
   space, or your household's shared data when you are in one. It can't reach recipes that live only on the phone.

Solo/offline use of the app still needs no account. Only cloud sync and MCP need one.

## Connect

Add a custom connector / remote MCP server with the URL above. No API key, client ID or secret is needed
(the client registers itself). The client opens a sign-in page (`jasonvgriffin.github.io/my-recipe-app/oauth/consent`):

1. Enter the email you use in the app. You get a 6-digit code by email.
2. Enter the code, then tap **Connect**. You go back to your assistant, connected.

Examples:

- **Grok** (app or grok.com): Connectors → New Connector → Custom. Name `My Recipe App`, Server URL as above.
  Leave any OAuth client ID / secret fields empty.
- **Claude:** Settings → Connectors → Add custom connector → paste the URL.
- **ChatGPT:** Settings → Connectors (developer mode) → Create → paste the URL, authentication OAuth.
- **Other clients:** add a remote MCP server (Streamable HTTP) with the URL; choose OAuth.
- **MCP Inspector:** `npx @modelcontextprotocol/inspector`, transport "Streamable HTTP", the URL above.

The connection lasts as long as your Supabase session. Sign in again if it ends.

## Tools

| Tool | What it does |
|------|--------------|
| `search_recipes` | Keyword / tag / category / minimum-rating search |
| `get_recipe` | One recipe: ingredients, steps, notes, tags, categories, source link |
| `add_recipe` | Add from a `url`, plain `text`, or a structured `recipe`. Uses the app's `importRecipe` pipeline: same validation, URL dedupe, **allulose only, never monk fruit**; nutrition data is ignored |
| `update_recipe` | Change title, servings, ingredients, steps, notes, tags or rating (lists replace the old ones) |
| `list_tags`, `list_categories` | What exists already |
| `get_meal_plan`, `plan_meal` | Read the plan; put a recipe on a day (optional slot and servings) |
| `get_shopping_list`, `build_shopping_list`, `add_shopping_item`, `check_shopping_item` | The week's list. Build compiles it from the meal plan, keeps checked and manual lines, and skips pantry items |

There are no nutrition tools. This is a recipe app, not a nutrition app. Cooking-mode (cook-with-me)
control stays on the phone: the cook session lives on the device, and assistants on the phone use the
`myrecipeapp://cook/...` deep links (docs/COOK_API.md).

## Limits and safety

- **Auth:** OAuth 2.1 with PKCE (S256) and dynamic client registration, provided by Supabase Auth's OAuth 2.1
  server (free, beta). Sign-in is the app's email-code account (existing accounts only; created by signing in in
the app). No household is required: a user in no household works in their personal space (`household_id` NULL,
`owner_id` = them; docs/SYNC.md "Personal space"), a household member in the household's shared data. The client gets a
  Supabase access token for you (1 hour, refreshable); every query runs as you, under the same row-level
  security as the app. Connected apps show up in Supabase under Authentication → OAuth Apps.
- **Entitlement:** `mcpAccess` in `src/entitlements` (free in v1). It is checked on every request and at sign-in.
- **Rate limits (per user):** 60 requests a minute and 2,000 a day (`MCP_RATE_LIMITS`). Over the limit you get
  HTTP 429 with `Retry-After`. Counters live in `public.mcp_rate_limits` (migration `20261003030000_mcp_rate_limits.sql`).
- URL imports fetch only public http(s) addresses (no localhost or private networks).
- Supabase's built-in email service sends only a few emails an hour per project. That is enough for one
  household. Heavier use needs custom SMTP (also free with a free mail provider).

## How it is built

- `src/mcp/`: runtime-neutral core, tested in `__tests__/mcp.test.ts`.
  - `server.ts`: HTTP routes, protected resource metadata, consent backend, JSON-RPC.
  - `tools.ts`: tools built on `importRecipeWith`, `applyRecipeEdit`, `filterRecipes`,
    `compileWeekShoppingList`, `addManualItem`, `isInPantry`.
  - `repo.ts`: synced tables through `src/sync/rows.ts`, scoped to the household or (none) the personal space.
  - `oauth.ts`: resource metadata, Supabase issuer, input checks.
  - `rate-limit.ts`
- `supabase/functions/mcp/`: Supabase Edge Function binding (supabase-js, env).
- `site/oauth/consent.html`: the consent page, published by `.github/workflows/pages.yml` to GitHub Pages
  (free). An Edge Function can't serve it: Supabase serves function HTML as `text/plain`.
- OAuth discovery (why Supabase Auth is the authorization server): strict clients follow RFC 9728 / RFC 8414
  and fetch authorization-server metadata only at the ROOT of the host
  (`/.well-known/oauth-authorization-server/<issuer path>`). The Supabase gateway owns the root, so a function
  can't answer there. Grok's connector manager stopped at that 401 ("Couldn't add the connector", Oct 3 2026).
  Supabase Auth serves its own root-level metadata, so the issuer is `https://<ref>.supabase.co/auth/v1`.
- Endpoints:
  - `<server>/.well-known/oauth-protected-resource`: `resource` = the server URL, `authorization_servers` = Supabase Auth
  - `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`: discovery (Supabase)
  - `.../auth/v1/oauth/clients/register`, `/oauth/authorize`, `/oauth/token`: Supabase
  - `<server>/consent/send`, `<server>/consent/verify`: JSON backend of the consent page (email code, entitlement,
    then approves the Supabase authorization and ends the consent session)
  - `POST <server>`: MCP Streamable HTTP, JSON responses, stateless. Unauthenticated calls get 401 with
    `WWW-Authenticate: Bearer resource_metadata="…"`
  - `GET` / `DELETE <server>` without a valid token: the same 401 challenge (405 only once authenticated; no SSE
    stream). Grok's connector (rmcp) probes discovery with a bare GET on the server URL and reads
    `resource_metadata` only from a 401. The old 405 sent it to the root RFC 9728 URL
    `https://<ref>.supabase.co/.well-known/oauth-protected-resource/functions/v1/mcp`, which the Supabase
    gateway rejects (401, no apikey), so Grok said "Connection failed" (Oct 3 2026).
- Hosting: Supabase Edge Functions on the free plan (500k invocations/month). Nothing here costs money.

## Deploying

`.github/workflows/supabase-functions.yml` type-checks and bundles the function on every change to `main`,
then deploys it when the repo secret `SUPABASE_ACCESS_TOKEN` is set. That secret is a free Supabase personal
access token from https://supabase.com/dashboard/account/tokens. Without the token the job only warns.

Manual deploy, from a machine logged in with `supabase login`:

```sh
cd supabase/functions/mcp && deno bundle --platform deno -o /tmp/mcp/index.js index.ts
# or simply, from the repo root:
supabase functions deploy mcp --project-ref krqmumdgsfimasjawxqn --no-verify-jwt
```

Optional function secret: `MCP_PUBLIC_URL`, only needed behind a custom domain.

Supabase Auth settings this needs (set Oct 3 2026 via the Management API; mirrored in `supabase/config.toml`):

- Authentication → OAuth Server: enabled, dynamic client registration on, authorization path `/oauth/consent`.
- Authentication → URL Configuration: Site URL `https://jasonvgriffin.github.io/my-recipe-app` (the consent page
  is Site URL + path). The app's sign-in is unaffected: its emails show a code and it passes its own
  `myrecipeapp://auth` redirect, which stays in the allow list.
- Repo Settings → Pages: source "GitHub Actions" (serves `site/`).

The rate-limit table is created by the normal migrations workflow (`supabase-migrations.yml`).
