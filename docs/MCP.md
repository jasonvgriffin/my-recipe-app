# AI assistant access (remote MCP server)

Ask Grok, Claude, ChatGPT or another MCP client to find, add and edit recipes, plan meals and manage the
shopping list. Changes land in your household's synced data and show up in the app on its next sync.
This feature is in v1.0 (approved by Jason, Oct 3 2026).

**Server URL:** `https://krqmumdgsfimasjawxqn.supabase.co/functions/v1/mcp`

## Before you connect

1. In the app, open **Settings → Household**, sign in with your email code, and create or join a household.
2. Let the app sync once, so your recipes are in Supabase. The assistant can only see synced household data.
   It can't reach recipes that live only on the phone.

Solo/offline use of the app still needs no account. Only MCP needs one.

## Connect

Add a custom connector / remote MCP server with the URL above. No API key is needed. The client opens a
sign-in page:

1. Enter the email you use in the app. You get a 6-digit code by email.
2. Enter the code, then tap **Connect**. You go back to your assistant, connected.

Examples:

- **Claude:** Settings → Connectors → Add custom connector → paste the URL.
- **ChatGPT:** Settings → Connectors (developer mode) → Create → paste the URL, authentication OAuth.
- **Grok / other clients:** add a remote MCP server (Streamable HTTP) with the URL; choose OAuth.
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

- **Auth:** OAuth 2.1 with PKCE (S256) and dynamic client registration. Sign-in is the household email-code
  account. The server seals the Supabase session inside its own tokens, so clients never see a raw Supabase
  token. Every query runs as you, under the same row-level security as the app.
- **Entitlement:** `mcpAccess` in `src/entitlements` (free in v1). It is checked on every request and at sign-in.
- **Rate limits (per user):** 60 requests a minute and 2,000 a day (`MCP_RATE_LIMITS`). Over the limit you get
  HTTP 429 with `Retry-After`. Counters live in `public.mcp_rate_limits` (migration `20261003030000_mcp_rate_limits.sql`).
- URL imports fetch only public http(s) addresses (no localhost or private networks).
- Supabase's built-in email service sends only a few emails an hour per project. That is enough for one
  household. Heavier use needs custom SMTP (also free with a free mail provider).

## How it is built

- `src/mcp/`: runtime-neutral core, tested in `__tests__/mcp.test.ts`.
  - `server.ts`: HTTP routes, OAuth endpoints, JSON-RPC.
  - `tools.ts`: tools built on `importRecipeWith`, `applyRecipeEdit`, `filterRecipes`,
    `compileWeekShoppingList`, `addManualItem`, `isInPantry`.
  - `repo.ts`: synced tables through `src/sync/rows.ts`.
  - `oauth.ts`: stateless sealed clients, codes and tokens.
  - `rate-limit.ts`
- `supabase/functions/mcp/`: Supabase Edge Function binding (supabase-js, env).
- Endpoints, all relative to the server URL:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server` (also `/.well-known/openid-configuration`)
  - `/register`, `/authorize`, `/token`
  - `POST /`: MCP Streamable HTTP, JSON responses, stateless
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

Optional function secrets:

- `MCP_OAUTH_SECRET`: sealing key. By default it is derived from the service-role key. Rotating it signs
  every assistant out.
- `MCP_PUBLIC_URL`: only needed behind a custom domain.

The rate-limit table is created by the normal migrations workflow (`supabase-migrations.yml`).
