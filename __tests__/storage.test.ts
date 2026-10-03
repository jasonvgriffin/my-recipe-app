import { createPantryStore } from '@/storage/pantry';
import { createSettingsStore } from '@/storage/settings';
import { asLegacySample, SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { createRecipe } from '@/lib/recipe-utils';
import { createRecipeStore, RECIPES_STORAGE_KEY, type KeyValueStore } from '@/storage/recipes';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

describe('recipe store', () => {
  it('seeds nothing on a fresh install (v1.0.1)', async () => {
    const store = createRecipeStore(memoryStore());
    expect(await store.removeUntouchedSamples()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('removes only untouched v1.0.0 sample recipes, once, and never user recipes', async () => {
    const store = createRecipeStore(memoryStore());
    // What v1.0.0 seeded: the two samples under fresh UUIDs.
    const [chicken, mousse] = SAMPLE_RECIPES;
    await store.save(asLegacySample(chicken, 'a1'));
    await store.save(asLegacySample(mousse, 'a2'));
    // An edited sample (rated) and a user recipe with a sample's title are kept.
    await store.save({ ...asLegacySample(chicken, 'edited'), rating: 5 });
    const mine = createRecipe({ title: chicken.title, ingredients: [{ text: '1 lb chicken' }], steps: [], tags: [], servings: 2 });
    await store.save(mine);
    expect(await store.removeUntouchedSamples()).toBe(2);
    expect((await store.list()).map((r) => r.id).sort()).toEqual(['edited', mine.id].sort());
    // Runs once: a sample synced in later is left alone.
    await store.save(asLegacySample(mousse, 'later'));
    expect(await store.removeUntouchedSamples()).toBe(0);
    expect(await store.get('later')).toBeTruthy();
  });

  it('saves, updates, gets, removes and lists tags', async () => {
    const store = createRecipeStore(memoryStore());
    const r = createRecipe(
      {
        title: 'Eggs',
        ingredients: [{ text: '2 eggs' }],
        steps: [{ text: 'Scramble' }],
        tags: ['breakfast'],
        servings: 1,
      },
      new Date('2026-01-01T00:00:00Z'),
      'eggs',
    );
    await store.save(r);
    await store.save({ ...r, title: 'Scrambled Eggs' });
    expect(await store.list()).toHaveLength(1);
    expect((await store.get('eggs'))?.title).toBe('Scrambled Eggs');
    expect(await store.listTags()).toEqual(['breakfast']);
    await store.remove('eggs');
    expect(await store.get('eggs')).toBeUndefined();
  });

  it('ignores corrupt or invalid stored data', async () => {
    const kv = memoryStore();
    const store = createRecipeStore(kv);
    kv.data.set(RECIPES_STORAGE_KEY, 'not json');
    expect(await store.list()).toEqual([]);
    kv.data.set(RECIPES_STORAGE_KEY, JSON.stringify([{ id: 1 }, SAMPLE_RECIPES[0]]));
    expect(await store.list()).toEqual([SAMPLE_RECIPES[0]]);
  });
});

describe('pantry + settings stores', () => {
  it('upserts pantry items by normalized name and persists settings', async () => {
    const kv = memoryStore();
    const pantry = createPantryStore(kv);
    const a = await pantry.upsert('Almond Flour', 2, 'cup');
    const b = await pantry.upsert('almond  flour!', 3, 'cup');
    expect(b.id).toBe(a.id);
    expect(await pantry.list()).toEqual([expect.objectContaining({ name: 'almond flour', quantity: 3 })]);
    const settings = createSettingsStore(kv);
    expect((await settings.get()).unitSystem).toBe('original');
    await settings.update({ unitSystem: 'metric' });
    expect((await settings.get()).unitSystem).toBe('metric');
    await settings.update({ cookedRecentlyDays: 400 });
    expect((await settings.get()).cookedRecentlyDays).toBe(365);
    await settings.update({ cookedRecentlyDays: 0 });
    expect((await settings.get()).cookedRecentlyDays).toBe(1);
  });
});
