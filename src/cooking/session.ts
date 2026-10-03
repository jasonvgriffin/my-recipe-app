/**
 * Cook-with-me session (spec #24) — the app owns step-by-step cooking state; there is NO in-app TTS.
 * The user's own AI assistant reads steps aloud with its own voice, asks the app for the current step,
 * and advances when the user says "next". Cooking mode UI (spec #19), deep links
 * (myrecipeapp://cook/...) and the future MCP server all drive THIS module. Contract: docs/COOK_API.md.
 *
 * UI-free (no React / react-native). State is persisted in a KeyValueStore so it survives app restarts.
 */
import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import type { KeyValueStore } from '@/storage/kv';
import type { Ingredient, Recipe } from '@/types/recipe';

import { formatIngredient, ingredientKey } from '@/lib/ingredients';

export const COOK_SESSION_STORAGE_KEY = 'my-recipe-app/cook-session/v1';

export interface StepTimer {
  stepIndex: number;
  durationSeconds: number;
  startedAt: string; // ISO
  endsAt: string; // ISO
}

/** Persisted session state. */
export interface CookSessionState {
  recipeId: string;
  stepIndex: number;
  startedAt: string;
  updatedAt: string;
  /** Running/finished step timers (UI schedules the notification; see COOK_API.md). */
  timers: StepTimer[];
}

/** What an assistant reads aloud / the cooking-mode screen renders. */
export interface CurrentStep {
  recipeId: string;
  title: string;
  /** 0-based. */
  stepIndex: number;
  totalSteps: number;
  text: string;
  durationSeconds?: number;
  /** Ingredients mentioned in this step (best-effort name match), formatted for reading aloud. */
  ingredientsForStep?: string[];
  isFirst: boolean;
  isLast: boolean;
  /** Timer for this step, with seconds remaining at the time of the call. */
  timer?: StepTimer & { remainingSeconds: number };
  /**
   * Every timer in the session (one per step). Several steps can count down at once (spec #15).
   * Remaining time is computed at the moment of the call.
   */
  activeTimers?: (StepTimer & { remainingSeconds: number })[];
}

export type CookErrorCode = 'no_session' | 'recipe_not_found' | 'no_steps' | 'no_timer_for_step' | 'feature_locked';

export type CookResult =
  | {
      ok: true;
      step: CurrentStep;
      event: 'started' | 'current' | 'advanced' | 'went_back' | 'repeated' | 'timer_started';
    }
  | { ok: true; event: 'finished' | 'ended'; recipeId: string; title: string }
  | { ok: false; code: CookErrorCode; message: string };

export interface CookDeps {
  getRecipe: (id: string) => Promise<Recipe | undefined>;
  kv: KeyValueStore;
  now?: () => Date;
  /** Feature gate (paywall-ready). Defaults to the app-wide gate. */
  canUse?: CanUse;
}

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'taste', 'fresh', 'large', 'small', 'dried']);

export function ingredientsForStep(stepText: string, ingredients: Ingredient[]): string[] {
  const text = stepText.toLowerCase();
  return ingredients
    .filter((i) => {
      const key = ingredientKey(i);
      if (!key) return false;
      // Match the full name or its last word ("chicken thighs" ↔ "chicken"/"thighs").
      const words = key.split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
      return text.includes(key) || words.some((w) => new RegExp(`\\b${w}`).test(text));
    })
    .map(formatIngredient);
}

export function createCookSession({ getRecipe, kv, now = () => new Date(), canUse = defaultCanUse }: CookDeps) {
  /** The session powers both cooking mode (#19) and cook-with-me (#24); either one unlocks it. */
  const sessionLocked = (): CookResult | undefined =>
    canUse('cookingMode') || canUse('cookWithMe')
      ? undefined
      : { ok: false, code: 'feature_locked', message: 'Cooking mode is not available.' };
  async function load(): Promise<CookSessionState | undefined> {
    try {
      const raw = await kv.getItem(COOK_SESSION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CookSessionState) : undefined;
    } catch {
      return undefined;
    }
  }
  async function persist(state: CookSessionState) {
    await kv.setItem(COOK_SESSION_STORAGE_KEY, JSON.stringify({ ...state, updatedAt: now().toISOString() }));
  }

  function view(recipe: Recipe, state: CookSessionState): CurrentStep {
    const step = recipe.steps[state.stepIndex];
    const activeTimers = state.timers.map((t) => ({
      ...t,
      remainingSeconds: Math.max(0, Math.round((Date.parse(t.endsAt) - now().getTime()) / 1000)),
    }));
    const timer = [...activeTimers].reverse().find((t) => t.stepIndex === state.stepIndex);
    const out: CurrentStep = {
      recipeId: recipe.id,
      title: recipe.title,
      stepIndex: state.stepIndex,
      totalSteps: recipe.steps.length,
      text: step.text,
      isFirst: state.stepIndex === 0,
      isLast: state.stepIndex === recipe.steps.length - 1,
    };
    if (step.durationSeconds) out.durationSeconds = step.durationSeconds;
    const ings = ingredientsForStep(step.text, recipe.ingredients);
    if (ings.length) out.ingredientsForStep = ings;
    if (activeTimers.length) out.activeTimers = activeTimers;
    if (timer) out.timer = timer;
    return out;
  }

  /** Load session + recipe, clamping the index if the recipe was edited meanwhile. */
  async function active(): Promise<{ state: CookSessionState; recipe: Recipe } | CookResult> {
    const state = await load();
    const locked = sessionLocked();
    if (locked) return locked;
    if (!state) return { ok: false, code: 'no_session', message: 'No cooking session. Start one with a recipe first.' };
    const recipe = await getRecipe(state.recipeId);
    if (!recipe)
      return { ok: false, code: 'recipe_not_found', message: 'The recipe for this session no longer exists.' };
    if (recipe.steps.length === 0) return { ok: false, code: 'no_steps', message: `“${recipe.title}” has no steps.` };
    state.stepIndex = Math.min(Math.max(0, state.stepIndex), recipe.steps.length - 1);
    return { state, recipe };
  }
  const isErr = (v: unknown): v is CookResult => typeof v === 'object' && v !== null && 'ok' in v;

  async function move(delta: number, event: 'advanced' | 'went_back'): Promise<CookResult> {
    const a = await active();
    if (isErr(a)) return a;
    const { state, recipe } = a;
    if (delta > 0 && state.stepIndex === recipe.steps.length - 1) {
      return { ok: true, event: 'finished', recipeId: recipe.id, title: recipe.title };
    }
    state.stepIndex = Math.min(Math.max(0, state.stepIndex + delta), recipe.steps.length - 1);
    await persist(state);
    return { ok: true, event, step: view(recipe, state) };
  }

  return {
    /** Start (or restart) cooking a recipe at step 1 (or `stepIndex`). Replaces any existing session. */
    async startSession(recipeId: string, stepIndex = 0): Promise<CookResult> {
      const locked = sessionLocked();
      if (locked) return locked;
      const recipe = await getRecipe(recipeId);
      if (!recipe) return { ok: false, code: 'recipe_not_found', message: `No recipe with id ${recipeId}.` };
      if (recipe.steps.length === 0) return { ok: false, code: 'no_steps', message: `“${recipe.title}” has no steps.` };
      const ts = now().toISOString();
      const state: CookSessionState = {
        recipeId,
        stepIndex: Math.min(Math.max(0, stepIndex), recipe.steps.length - 1),
        startedAt: ts,
        updatedAt: ts,
        timers: [],
      };
      await persist(state);
      return { ok: true, event: 'started', step: view(recipe, state) };
    },
    async getCurrentStep(): Promise<CookResult> {
      const a = await active();
      if (isErr(a)) return a;
      return { ok: true, event: 'current', step: view(a.recipe, a.state) };
    },
    /** Advance; on the last step returns event 'finished' (session stays until endSession). */
    next: () => move(1, 'advanced'),
    previous: () => move(-1, 'went_back'),
    /** Same step again (for "repeat that"). */
    async repeat(): Promise<CookResult> {
      const a = await active();
      if (isErr(a)) return a;
      return { ok: true, event: 'repeated', step: view(a.recipe, a.state) };
    },
    /** Jump to a step (0-based). */
    async goTo(stepIndex: number): Promise<CookResult> {
      const a = await active();
      if (isErr(a)) return a;
      a.state.stepIndex = Math.min(Math.max(0, stepIndex), a.recipe.steps.length - 1);
      await persist(a.state);
      return { ok: true, event: 'current', step: view(a.recipe, a.state) };
    },
    /**
     * Start a step timer (uses that step's durationSeconds unless overridden). Records `{ startedAt, endsAt }`
     * in state. One timer per step; timers on other steps keep running (spec #15). Does not move the
     * current step when `forStepIndex` is passed. The UI layer schedules the local notification for `endsAt`.
     */
    async startStepTimer(durationSeconds?: number, forStepIndex?: number): Promise<CookResult> {
      if (!canUse('timers')) return { ok: false, code: 'feature_locked', message: 'Step timers are not available.' };
      const a = await active();
      if (isErr(a)) return a;
      const index =
        forStepIndex === undefined
          ? a.state.stepIndex
          : Math.min(Math.max(0, Math.floor(forStepIndex)), a.recipe.steps.length - 1);
      const secs = durationSeconds ?? a.recipe.steps[index].durationSeconds;
      if (!secs || secs <= 0)
        return { ok: false, code: 'no_timer_for_step', message: 'This step has no time. Say how long.' };
      const start = now();
      a.state.timers = [
        ...a.state.timers.filter((t) => t.stepIndex !== index),
        {
          stepIndex: index,
          durationSeconds: secs,
          startedAt: start.toISOString(),
          endsAt: new Date(start.getTime() + secs * 1000).toISOString(),
        },
      ];
      await persist(a.state);
      return { ok: true, event: 'timer_started', step: view(a.recipe, a.state) };
    },
    async endSession(): Promise<CookResult> {
      const state = await load();
      if (!state) return { ok: false, code: 'no_session', message: 'No cooking session.' };
      const recipe = await getRecipe(state.recipeId);
      await kv.removeItem(COOK_SESSION_STORAGE_KEY);
      return { ok: true, event: 'ended', recipeId: state.recipeId, title: recipe?.title ?? '' };
    },
    /** Raw persisted state (e.g. to resume cooking mode after a restart). */
    getState: load,
  };
}

export type CookSession = ReturnType<typeof createCookSession>;
