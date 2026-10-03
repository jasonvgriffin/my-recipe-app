import { UUID_RE } from '@/lib/ids';
import { createPantryStore } from '@/storage/pantry';
import { createSettingsStore } from '@/storage/settings';
import { SEED_RECIPES } from '@/data/seed';
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
  it('seeds once and lists recipes', async () => {
    const kv = memoryStore();
    const store = createRecipeStore(kv);
    await store.seedIfNeeded();
    const seeded = await store.list();
    expect(seeded.map((r) => r.title).sort()).toEqual(SEED_RECIPES.map((r) => r.title).sort());
    expect(seeded.every((r) => UUID_RE.test(r.id))).toBe(true); // fresh UUIDs per device (spec #25)
    await store.remove(seeded[0].id);
    await store.seedIfNeeded(); // must not re-add deleted seed
    expect((await store.list()).map((r) => r.id)).toEqual([seeded[1].id]);
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
        nutrition: { netCarbsG: 1 },
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
    kv.data.set(RECIPES_STORAGE_KEY, JSON.stringify([{ id: 1 }, SEED_RECIPES[0]]));
    expect(await store.list()).toEqual([SEED_RECIPES[0]]);
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
