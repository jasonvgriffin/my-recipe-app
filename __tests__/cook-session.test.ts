import { createCookSession, parseCookDeepLink, runCookCommand, type CookResult } from '@/cooking';
import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import type { KeyValueStore } from '@/storage/kv';
import type { Recipe } from '@/types/recipe';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const chicken = SAMPLE_RECIPES[0]; // 4 steps; step 4 "Roast 35–40 minutes ..."
const recipes = new Map<string, Recipe>([[chicken.id, chicken]]);
let clock = new Date('2026-10-02T18:00:00Z');
const deps = (kv: KeyValueStore) => ({ getRecipe: async (id: string) => recipes.get(id), kv, now: () => clock });
const step = (r: CookResult) => {
  if (!r.ok || !('step' in r)) throw new Error(`expected a step, got ${JSON.stringify(r)}`);
  return r.step;
};

describe('cook-with-me session state machine (spec #24)', () => {
  it('starts, reads, advances, goes back, repeats, finishes and ends', async () => {
    const s = createCookSession(deps(memoryStore()));
    expect(await s.getCurrentStep()).toMatchObject({ ok: false, code: 'no_session' });

    const first = step(await s.startSession(chicken.id));
    expect(first).toMatchObject({
      recipeId: chicken.id,
      title: chicken.title,
      stepIndex: 0,
      totalSteps: 4,
      isFirst: true,
    });
    expect(first.text).toBe(chicken.steps[0].text);

    expect(step(await s.previous()).stepIndex).toBe(0); // clamps at first step
    const second = step(await s.next());
    expect(second.stepIndex).toBe(1);
    expect(second.ingredientsForStep).toEqual(
      expect.arrayContaining(['2 tbsp olive oil', '3 cloves garlic, minced', '1 tsp dried thyme']),
    );
    expect(await s.repeat()).toMatchObject({ ok: true, event: 'repeated', step: { stepIndex: 1 } });
    await s.next();
    const last = step(await s.next());
    expect(last).toMatchObject({ stepIndex: 3, isLast: true, durationSeconds: 2400 });
    expect(await s.next()).toMatchObject({ ok: true, event: 'finished', recipeId: chicken.id });
    expect(await s.endSession()).toMatchObject({ ok: true, event: 'ended' });
    expect(await s.getCurrentStep()).toMatchObject({ ok: false, code: 'no_session' });
  });

  it('persists across app restarts (new session object, same storage)', async () => {
    const kv = memoryStore();
    const a = createCookSession(deps(kv));
    await a.startSession(chicken.id);
    await a.next();
    await a.next();
    const afterRestart = createCookSession(deps(kv));
    expect(step(await afterRestart.getCurrentStep()).stepIndex).toBe(2);
  });

  it('keeps timers on different steps running at the same time', async () => {
    const s = createCookSession(deps(memoryStore()));
    await s.startSession(chicken.id);
    await s.goTo(3);
    expect(step(await s.startStepTimer()).timer).toMatchObject({ stepIndex: 3, durationSeconds: 2400 });
    await s.goTo(0);
    const current = step(await s.startStepTimer(90));
    expect(current.stepIndex).toBe(0);
    expect(current.timer).toMatchObject({ stepIndex: 0, durationSeconds: 90 });
    expect(current.activeTimers?.map((t) => t.stepIndex).sort()).toEqual([0, 3]);
    clock = new Date(clock.getTime() + 30_000);
    const later = step(await s.getCurrentStep());
    expect(later.timer?.remainingSeconds).toBe(60);
    expect(later.activeTimers?.find((t) => t.stepIndex === 3)?.remainingSeconds).toBe(2370);
  });

  it('runs step timers and reports remaining time', async () => {
    const s = createCookSession(deps(memoryStore()));
    await s.startSession(chicken.id);
    expect(await s.startStepTimer()).toMatchObject({ ok: false, code: 'no_timer_for_step' });
    expect(step(await s.startStepTimer(90)).timer).toMatchObject({ durationSeconds: 90, remainingSeconds: 90 });
    await s.goTo(3);
    const t = step(await s.startStepTimer()).timer!;
    expect(t).toMatchObject({ stepIndex: 3, durationSeconds: 2400 });
    clock = new Date(clock.getTime() + 600_000);
    expect(step(await s.getCurrentStep()).timer?.remainingSeconds).toBe(1800);
  });

  it('handles missing recipes and clamps when a recipe lost steps', async () => {
    const kv = memoryStore();
    const s = createCookSession(deps(kv));
    expect(await s.startSession('nope')).toMatchObject({ ok: false, code: 'recipe_not_found' });
    await s.startSession(chicken.id, 3);
    recipes.set(chicken.id, { ...chicken, steps: chicken.steps.slice(0, 2) });
    expect(step(await s.getCurrentStep()).stepIndex).toBe(1);
    recipes.set(chicken.id, chicken);
  });
});

describe('cook deep links', () => {
  it.each([
    ['myrecipeapp://cook/abc-123', { action: 'start', recipeId: 'abc-123' }],
    ['myrecipeapp://cook/abc-123?step=3', { action: 'start', recipeId: 'abc-123', stepIndex: 2 }],
    ['myrecipeapp://cook/next', { action: 'next' }],
    ['myrecipeapp://cook/previous', { action: 'previous' }],
    ['myrecipeapp://cook/current', { action: 'current' }],
    ['myrecipeapp:///cook/repeat', { action: 'repeat' }],
    ['myrecipeapp://cook/timer', { action: 'timer' }],
    ['myrecipeapp://cook/end', { action: 'end' }],
    ['myrecipeapp://import?url=x', undefined],
    ['https://example.com/cook/next', undefined],
  ])('%s', (link, cmd) => expect(parseCookDeepLink(link)).toEqual(cmd));

  it('drives the session', async () => {
    const s = createCookSession(deps(memoryStore()));
    await runCookCommand(s, parseCookDeepLink(`myrecipeapp://cook/${chicken.id}`)!);
    const r = await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/next')!);
    expect(step(r).stepIndex).toBe(1);
    expect(step(await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/repeat')!)).stepIndex).toBe(1);
    expect(step(await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/previous')!)).stepIndex).toBe(0);
    await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/next')!);
    await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/next')!);
    await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/next')!);
    expect(await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/timer')!)).toMatchObject({
      ok: true,
      event: 'timer_started',
    });
    expect(step(await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/current')!)).stepIndex).toBe(3);
    expect(await runCookCommand(s, parseCookDeepLink('myrecipeapp://cook/end')!)).toMatchObject({
      ok: true,
      event: 'ended',
    });
  });
});
