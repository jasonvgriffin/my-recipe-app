/**
 * Paywall-ready feature gating (docs/SPEC.md, docs/DESIGN.md §8). Flipping a feature to `premium` with no
 * entitlement must hide/lock every entry point (tabs, buttons, deep links, module calls, sync) while the
 * core recipe workflow keeps working. v1 config: everything free.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { createCookSession, runCookCommand } from '@/cooking';
import { SEED_RECIPES } from '@/data/seed';
import {
  ALL_FEATURE_IDS,
  DEFAULT_FEATURE_CONFIG,
  FeatureLockedError,
  LocalFreeEntitlements,
  NoEntitlements,
  StaticEntitlements,
  canUse,
  createFeatureGate,
  featureGate,
  type FeatureId,
} from '@/entitlements';
import { importRecipeWith } from '@/import';
import { createBarcodeLookup } from '@/pantry/barcodeLookup';
import type { KeyValueStore } from '@/storage/kv';
import { createRecipeStore } from '@/storage/recipes';
import { settingsStore } from '@/storage/settings';
import { createSyncEngine, type RemoteAdapter, type SyncCollections } from '@/sync';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const premium = (...ids: FeatureId[]) =>
  Object.fromEntries(ids.map((id) => [id, { tier: 'premium' as const }])) as Parameters<
    typeof featureGate.setConfig
  >[0];

afterEach(() => {
  act(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });
});

describe('feature gate', () => {
  it('v1: every optional feature is free, enabled and available', () => {
    for (const id of ALL_FEATURE_IDS) {
      expect(DEFAULT_FEATURE_CONFIG[id]).toEqual({ tier: 'free', enabled: true });
      expect(canUse(id)).toBe(true);
    }
  });

  it('registers mcpAccess (future MCP server paywall switch), free in v1', () => {
    expect(DEFAULT_FEATURE_CONFIG.mcpAccess).toEqual({ tier: 'free', enabled: true });
    expect(canUse('mcpAccess')).toBe(true);
  });

  it('premium without entitlement is locked; granting it unlocks; kill switch beats entitlement', () => {
    const gate = createFeatureGate({
      config: { pantry: { tier: 'premium', enabled: true } },
      provider: new NoEntitlements(),
    });
    expect(gate.check('pantry')).toMatchObject({ available: false, reason: 'premium' });
    expect(() => gate.assert('pantry')).toThrow(FeatureLockedError);
    // Children follow their parent (barcode/receipt scanning need pantry)
    expect(gate.check('barcodeScan')).toMatchObject({ available: false, reason: 'requires' });
    expect(gate.canUse('mealPlan')).toBe(true);

    gate.setProvider(new StaticEntitlements(['pantry']));
    expect(gate.canUse('pantry')).toBe(true);
    expect(gate.canUse('barcodeScan')).toBe(true);

    gate.setConfig({ pantry: { enabled: false } });
    expect(gate.check('pantry')).toMatchObject({ available: false, reason: 'disabled' });
  });

  it('notifies subscribers on config/provider changes', () => {
    const gate = createFeatureGate();
    const listener = jest.fn();
    gate.subscribe(listener);
    gate.setConfig(premium('share'));
    gate.setProvider(new NoEntitlements());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('UI-free modules honour the gate (canUse)', () => {
  beforeEach(() => {
    featureGate.setProvider(new NoEntitlements());
  });

  it('importRecipe: link/text import locked, structured (core add path) still works', async () => {
    featureGate.setConfig(premium('linkImport'));
    const deps = { store: createRecipeStore(memoryStore()), fetchHtml: jest.fn(), now: () => new Date() };
    const r = await importRecipeWith(deps, { kind: 'url', url: 'https://example.com/r' });
    expect(r).toMatchObject({ ok: false, code: 'feature_locked' });
    expect(deps.fetchHtml).not.toHaveBeenCalled();
    const s = await importRecipeWith(deps, {
      kind: 'structured',
      recipe: { title: 'Egg cups', ingredients: ['6 eggs'], steps: ['Bake 20 minutes'], servings: 3 },
    });
    expect(s.ok).toBe(true);
  });

  it('cook session + deep links: cook-with-me / cooking mode / timers each gated', async () => {
    const recipe = SEED_RECIPES[0];
    const session = createCookSession({ getRecipe: async () => recipe, kv: memoryStore() });

    featureGate.setConfig(premium('cookWithMe'));
    expect(await runCookCommand(session, { action: 'start', recipeId: recipe.id })).toMatchObject({
      ok: false,
      code: 'feature_locked',
    });
    // In-app cooking mode still works
    expect(await runCookCommand(session, { action: 'start', recipeId: recipe.id }, { via: 'app' })).toMatchObject({
      ok: true,
    });

    featureGate.setConfig(premium('timers'));
    expect(await session.startStepTimer(60)).toMatchObject({ ok: false, code: 'feature_locked' });

    featureGate.setConfig(premium('cookingMode'));
    expect(await session.getCurrentStep()).toMatchObject({ ok: false, code: 'feature_locked' });
  });

  it('sync engine is a no-op when householdSync is locked', async () => {
    featureGate.setConfig(premium('householdSync'));
    const remote = { pull: jest.fn(), push: jest.fn() } as unknown as RemoteAdapter;
    const engine = createSyncEngine({
      collections: {} as SyncCollections,
      remote,
      kv: memoryStore(),
      householdId: 'h',
      userId: 'u',
    });
    expect((await engine.syncOnce()).skipped).toBe('feature_locked');
    expect(remote.pull).not.toHaveBeenCalled();
  });

  it('barcode lookup locked when pantry (its parent) is premium', async () => {
    featureGate.setConfig(premium('pantry'));
    const fetchJson = jest.fn();
    const lookup = createBarcodeLookup({ items: {} as never, fetchJson, newId: () => 'id' });
    expect(await lookup.lookup('4006381333931')).toMatchObject({ status: 'locked' });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/meal-plan': require('@/app/(tabs)/meal-plan').default,
  '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
  add: require('@/app/add').default,
  'recipe/[id]': require('@/app/recipe/[id]/index').default,
  'recipe/[id]/edit': require('@/app/recipe/[id]/edit').default,
  import: require('@/app/import').default,
  'cook/[action]': require('@/app/cook/[action]').default,
  'meal-plan/[date]': require('@/app/meal-plan/[date]').default,
  'grocery-run': require('@/app/grocery-run').default,
  settings: require('@/app/settings').default,
});

// Requiring every screen transforms most of the app. On a cold CI cache that alone can exceed Jest's 5 s
// per-test timeout, so load the screens once up front (with their own timeout) instead of inside the first test.
beforeAll(() => {
  routes();
}, 60_000);
// Full-router integration tests: the first render still pulls in navigation code, which is slow on shared CI runners.
jest.setTimeout(20_000);

describe('UI entry points follow the gate (separate from Settings toggles)', () => {
  beforeEach(async () => {
    await require('@react-native-async-storage/async-storage').clear();
    // User WANTS everything shown — the gate alone must hide locked features.
    await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: true } });
  });

  it('everything premium + no entitlement: optional entry points gone, recipe workflow intact', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium(...ALL_FEATURE_IDS));
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    expect(screen.queryByTestId('import-recipe-button')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Meal plan')).toBeNull());
    expect(screen.queryByText('Shopping list')).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-button')));
    await screen.findByText('Save recipe');
    expect(screen.queryByText('Tags (comma separated)')).toBeNull();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Cauliflower Mac & Cheese'), 'Zucchini Lasagna');
    fireEvent.changeText(screen.getByPlaceholderText(/1 head cauliflower/), '2 zucchini\n1 cup ricotta');
    fireEvent.changeText(screen.getByPlaceholderText(/Preheat oven/), 'Layer\nBake 30 minutes');
    fireEvent.changeText(screen.getByTestId('carbs-input'), '7');
    await act(async () => fireEvent.press(screen.getByText('Save recipe')));

    await act(async () => fireEvent.press(await screen.findByText('Zucchini Lasagna')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.getByText('Mark cooked')).toBeTruthy();
    expect(screen.getByText('Delete recipe')).toBeTruthy();
    expect(screen.queryByTestId('cook-button')).toBeNull();
    expect(screen.queryByTestId('plan-today-button')).toBeNull();
    expect(screen.queryByTestId('share-recipe-button')).toBeNull();
    expect(screen.getByTestId('edit-recipe-button')).toBeTruthy();
    expect(screen.queryByText(/⏱/)).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('edit-recipe-button')));
    expect(await screen.findByTestId('recipe-editor')).toBeTruthy();
    expect(screen.queryByTestId('take-photo-button')).toBeNull();
    expect(screen.queryByTestId('choose-photo-button')).toBeNull();
  });

  it('a locked link-import route shows a neutral message (no payment UI)', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('linkImport'));
    renderRouter(routes(), { initialUrl: '/import' });
    expect(await screen.findByTestId('feature-locked-linkImport')).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();
  });

  it('a locked cook-with-me deep link shows a neutral message (no payment UI)', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('cookWithMe'));
    renderRouter(routes(), { initialUrl: '/cook/current' });
    expect(await screen.findByTestId('feature-locked-cookWithMe')).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();
  });

  it('settings hides toggles for locked features; entitlement brings tabs back live', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('mealPlan'));
    renderRouter(routes(), { initialUrl: '/settings' });
    await screen.findByText('Optional features');
    expect(screen.queryByTestId('feature-toggle-mealPlan')).toBeNull();
    expect(screen.getByTestId('feature-toggle-shopping')).toBeTruthy();

    act(() => featureGate.setProvider(new StaticEntitlements(['mealPlan'])));
    expect(await screen.findByTestId('feature-toggle-mealPlan')).toBeTruthy();
  });
});
