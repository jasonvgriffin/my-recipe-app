# Cook-with-me API (`src/cooking/`) — spec #24

The app **owns step-by-step cooking state**. There is **no in-app TTS**: the user's own AI assistant
(Grok, etc.) reads steps aloud with its own voice, asks the app for the current step, and advances when the
user says "next". The cooking-mode UI (spec #19), deep links, and the **future remote MCP server** all drive
the same module — this file is the contract the MCP server will wrap.

Module is UI-free (ESLint-enforced). State is persisted in the KeyValueStore (`my-recipe-app/cook-session/v1`),
so a session survives app restarts. One active session per device.

## Interface

```ts
import { cookSession } from '@/cooking';            // app instance (on-device storage)
import { createCookSession } from '@/cooking/session'; // other hosts: createCookSession({ getRecipe, kv, now })

cookSession.startSession(recipeId: string, stepIndex = 0): Promise<CookResult> // replaces any active session
cookSession.getCurrentStep(): Promise<CookResult>
cookSession.next(): Promise<CookResult>       // on the last step → { event: 'finished' }
cookSession.previous(): Promise<CookResult>   // clamps at step 0
cookSession.repeat(): Promise<CookResult>     // same step, event 'repeated'
cookSession.goTo(stepIndex: number): Promise<CookResult>
cookSession.startStepTimer(durationSeconds?, stepIndex?): Promise<CookResult> // current step if stepIndex omitted; other steps' timers keep running
cookSession.endSession(): Promise<CookResult>
cookSession.getState(): Promise<CookSessionState | undefined>

interface CurrentStep {
  recipeId: string; title: string;
  stepIndex: number;           // 0-based (say "step stepIndex+1 of totalSteps")
  totalSteps: number;
  text: string;                // read this aloud
  durationSeconds?: number;    // detected from the step text (spec #15)
  ingredientsForStep?: string[]; // ingredients mentioned in the step, formatted ("2 tbsp olive oil")
  isFirst: boolean; isLast: boolean;
  timer?: { stepIndex; durationSeconds; startedAt; endsAt; remainingSeconds };
  /** Every running timer in the session (several steps can count down at once, spec #15). */
  activeTimers?: { stepIndex; durationSeconds; startedAt; endsAt; remainingSeconds }[];
}

type CookResult =
  | { ok: true; event: 'started' | 'current' | 'advanced' | 'went_back' | 'repeated' | 'timer_started'; step: CurrentStep }
  | { ok: true; event: 'finished' | 'ended'; recipeId: string; title: string }
  | { ok: false; code: 'no_session' | 'recipe_not_found' | 'no_steps' | 'no_timer_for_step' | 'feature_locked'; message: string };
```

Functions never throw for expected conditions; check `ok`. If the recipe is edited mid-session, the step index
is clamped to the new step count.

**Timers:** `startStepTimer` records `{ startedAt, endsAt }` in state (one per step, so timers on different steps
run together). The UI layer (`src/notifications/step-timers.ts`) schedules the local notification
(expo-notifications, spec #15) for `endsAt`, asks for notification permission (Android 13+ needs a channel
before the prompt; the manifest also declares exact-alarm permissions so the alert can fire on time), and
plays the default notification sound — including when the app is backgrounded. The cooking screen shows the
countdown. Any reader can compute `remainingSeconds` from state (`activeTimers` lists every running timer).

## Deep links

| Link                                              | Action                                  |
| ------------------------------------------------- | --------------------------------------- |
| `myrecipeapp://cook/{recipeId}`                   | start a session for the recipe (step 1) |
| `myrecipeapp://cook/{recipeId}?step=3`            | start at step 3 (1-based, as spoken)    |
| `myrecipeapp://cook/current`                      | show the current step                   |
| `myrecipeapp://cook/next` / `previous` / `repeat` | move / repeat                           |
| `myrecipeapp://cook/timer`                        | start the current step's timer          |
| `myrecipeapp://cook/end`                          | end the session                         |

Handled by the route `src/app/cook/[action].tsx` via `parseCookDeepLink` + `runCookCommand`, which renders
cooking mode (`src/components/cooking-mode.tsx`, spec #19). On-screen buttons call the same `cookSession`
methods, so a deep link and the cooking screen always show the same step. `?step=3` is read from the route's
query as well as from the link string. Deep links can drive the app but can't return data to the caller;
returning the step text to an assistant is the job of the future MCP server. There is no in-app text-to-speech.

## Future MCP server mapping (later phase, not v1)

| MCP tool                                            | Calls                          |
| --------------------------------------------------- | ------------------------------ |
| `cook_start(recipe_id, step?)`                      | `startSession`                 |
| `cook_current()`                                    | `getCurrentStep`               |
| `cook_next()` / `cook_previous()` / `cook_repeat()` | `next` / `previous` / `repeat` |
| `cook_timer(seconds?)`                              | `startStepTimer`               |
| `cook_end()`                                        | `endSession`                   |

Typical voice loop: user says "cook the lemon chicken" → assistant `cook_start` → reads `step.text` → user says
"next" → `cook_next` → … → `event: 'finished'`. With household sync (spec #25) the server would host the session
state; until then the session is per device.

Changing this contract requires updating this doc, `src/cooking/session.ts`, and `__tests__/cook-session.test.ts`.
