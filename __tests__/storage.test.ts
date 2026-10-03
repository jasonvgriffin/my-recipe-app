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
    await store.remove(SEED_RECIPES[0].id);
    await store.seedIfNeeded(); // must not re-add deleted seed
    expect((await store.list()).map((r) => r.id)).toEqual([SEED_RECIPES[1].id]);
  });

  it('saves, updates, gets, removes and lists tags', async () => {
    const store = createRecipeStore(memoryStore());
    const r = createRecipe(
      { title: 'Eggs', ingredients: [{ text: '2 eggs' }], steps: ['Scramble'], tags: ['breakfast'], servings: 1, carbsPerServing: 1 },
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
