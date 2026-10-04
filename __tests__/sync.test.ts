import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { createMealPlanStore } from '@/storage/meal-plan';
import { createPantryStore } from '@/storage/pantry';
import { createRecipeStore, type KeyValueStore } from '@/storage/recipes';
import { createCollection, type Collection, type StoredRecord } from '@/storage/kv';
import { setIdentity } from '@/storage/identity';
import { createSyncEngine, getSupabaseConfig, type RemoteAdapter, type SyncCollections } from '@/sync';
import { fromRow, toRow, type DbRow } from '@/sync/rows';
import type { SyncTable } from '@/types/sync';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

/** Fake Supabase: stores DB rows per table, upsert by id, RLS-like household filter. */
function fakeRemote(): RemoteAdapter & { rows: Map<SyncTable, Map<string, DbRow>> } {
  const rows = new Map<SyncTable, Map<string, DbRow>>();
  const t = (table: SyncTable) => rows.get(table) ?? rows.set(table, new Map()).get(table)!;
  return {
    rows,
    async pull(table, householdId, since) {
      return [...t(table).values()]
        .filter((r) => r.household_id === householdId && (!since || r.updated_at > since))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
        .map(fromRow);
    },
    async push(table, records) {
      for (const r of records) t(table).set(r.id, toRow(table, r as never));
    },
  };
}

function device() {
  const kv = memoryStore();
  const recipes = createRecipeStore(kv);
  const plan = createMealPlanStore(kv);
  const pantry = createPantryStore(kv);
  const c = <T extends StoredRecord>(col: Collection<T>) => col as unknown as Collection<StoredRecord>;
  const collections: SyncCollections = {
    recipes: c(recipes.collections.recipes),
    categories: c(recipes.collections.categories),
    pantry_items: c(pantry.collection),
    meal_plan_entries: c(plan.collections.entries),
    shopping_items: c(plan.collections.items),
    barcode_items: c(createCollection<StoredRecord>(kv, 'barcodes', (v) => v as StoredRecord)),
  };
  return { kv, recipes, plan, pantry, collections };
}

const HH = '11111111-1111-4111-8111-111111111111';
const at = (iso: string) => new Date(iso);

afterEach(() => setIdentity({}));

describe('household sync (spec #25)', () => {
  it('adopts solo data, syncs between members, resolves conflicts LWW and propagates deletes', async () => {
    const remote = fakeRemote();
    const alice = device();
    const bob = device();

    // Alice used the app offline/solo first.
    const solo = await alice.recipes.save({ ...SAMPLE_RECIPES[0] }, at('2026-10-01T10:00:00Z'));
    expect(solo.householdId).toBeUndefined();
    await alice.pantry.upsert('allulose', 1, 'cup', at('2026-10-01T10:00:00Z'));

    const engineA = createSyncEngine({
      ...alice,
      remote,
      householdId: HH,
      userId: 'alice',
      now: () => at('2026-10-02T10:00:00Z'),
    });
    const engineB = createSyncEngine({
      ...bob,
      remote,
      householdId: HH,
      userId: 'bob',
      now: () => at('2026-10-02T10:00:00Z'),
    });

    const r1 = await engineA.syncOnce();
    expect(r1.pushed.recipes).toBe(1);
    expect(r1.pushed.pantry_items).toBe(1);
    const row = remote.rows.get('recipes')!.get(solo.id)!;
    expect(row).toMatchObject({ household_id: HH, created_by: 'alice', title: solo.title, deleted_at: null });

    await engineB.syncOnce();
    expect((await bob.recipes.get(solo.id))?.title).toBe(solo.title);
    expect((await bob.pantry.list()).map((p) => p.name)).toEqual(['allulose']);

    // Concurrent edits: Bob's is later → wins everywhere.
    const base = (await alice.recipes.get(solo.id))!;
    await alice.recipes.save({ ...base, title: 'Alice title' }, at('2026-10-02T11:00:00Z'));
    await bob.recipes.save({ ...base, title: 'Bob title' }, at('2026-10-02T11:05:00Z'));
    await engineA.syncOnce();
    await engineB.syncOnce();
    await engineA.syncOnce();
    expect((await alice.recipes.get(solo.id))?.title).toBe('Bob title');
    expect((await bob.recipes.get(solo.id))?.title).toBe('Bob title');

    // Delete on Alice → tombstone reaches Bob.
    await alice.recipes.collections.recipes.remove(solo.id, at('2026-10-02T12:00:00Z'));
    await engineA.syncOnce();
    await engineB.syncOnce();
    expect(await bob.recipes.get(solo.id)).toBeUndefined();
    expect(remote.rows.get('recipes')!.get(solo.id)!.deleted_at).toBe('2026-10-02T12:00:00.000Z');
  });

  it('syncs a signed-in user with NO household to their personal space, then shares it on joining (v1.0.6)', async () => {
    const remote = fakeRemote();
    const phone = device();
    const tablet = device();
    const offline = await phone.recipes.save({ ...SAMPLE_RECIPES[0] }, at('2026-10-01T10:00:00Z'));
    setIdentity({ userId: 'ada' });
    const signedIn = await phone.recipes.save({ ...SAMPLE_RECIPES[1] }, at('2026-10-01T11:00:00Z'));
    expect(signedIn).toMatchObject({ createdBy: 'ada' });
    expect(signedIn.householdId).toBeUndefined();
    // Someone else's personal record left on the device (other account signed out) is never pushed.
    const foreign = await phone.recipes.save({ ...SAMPLE_RECIPES[2], createdBy: 'bob' } as never, at('2026-10-01T11:30:00Z'));

    const personal = (d: ReturnType<typeof device>) =>
      createSyncEngine({ ...d, remote, userId: 'ada', now: () => at('2026-10-02T10:00:00Z') });
    const r = await personal(phone).syncOnce();
    expect(r.pushed.recipes).toBe(2);
    expect(remote.rows.get('recipes')!.get(offline.id)).toMatchObject({ household_id: null, created_by: 'ada' });
    expect(remote.rows.get('recipes')!.get(signedIn.id)).toMatchObject({ household_id: null, created_by: 'ada' });
    expect(remote.rows.get('recipes')!.has(foreign.id)).toBe(false);
    expect(await phone.kv.getItem('my-recipe-app/sync-cursors/personal/ada')).toBeTruthy();

    // A second device of the same user pulls the personal space (no household anywhere).
    await personal(tablet).syncOnce();
    const pulled = await tablet.recipes.get(signedIn.id);
    expect(pulled).toMatchObject({ title: signedIn.title, createdBy: 'ada' });
    expect(pulled?.householdId).toBeUndefined();

    // Joining a household later adopts the personal records into it (household sharing is optional on top).
    const shared = createSyncEngine({ ...phone, remote, householdId: HH, userId: 'ada', now: () => at('2026-10-03T10:00:00Z') });
    await shared.syncOnce();
    expect(remote.rows.get('recipes')!.get(signedIn.id)).toMatchObject({ household_id: HH });
  });

  it('personal sync needs cloudSync, never householdSync', async () => {
    const remote = { pull: jest.fn(async () => []), push: jest.fn(async () => {}) };
    const d = device();
    const noHousehold = createSyncEngine({ ...d, remote, userId: 'ada', canUse: (id) => id !== 'householdSync' });
    expect((await noHousehold.syncOnce()).skipped).toBeUndefined();
    expect(remote.pull).toHaveBeenCalledWith('recipes', null, undefined);
    const locked = createSyncEngine({ ...d, remote, userId: 'ada', canUse: (id) => id !== 'cloudSync' });
    expect((await locked.syncOnce()).skipped).toBe('feature_locked');
  });

  it('stamps householdId/createdBy on new records from the active identity', async () => {
    setIdentity({ userId: 'u1', householdId: HH });
    const d = device();
    const entry = await d.plan.addEntry('2026-10-02', 'r1');
    expect(entry).toMatchObject({ householdId: HH, createdBy: 'u1' });
  });

  it('reads Supabase config from EXPO_PUBLIC_* only when complete and https', () => {
    expect(getSupabaseConfig({})).toBeUndefined();
    expect(
      getSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: 'http://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'k' }),
    ).toBeUndefined();
    expect(
      getSupabaseConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co/', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
  });

  it('round-trips every synced record with household_id and author', async () => {
    const remote = fakeRemote();
    const alice = device();
    const bob = device();
    setIdentity({ userId: 'alice', householdId: HH });
    const when = at('2026-10-03T08:00:00.000Z');

    const recipe = await alice.recipes.save({ ...SAMPLE_RECIPES[0] }, when);
    const category = await alice.recipes.addCategory('Dinner', when);
    const pantry = await alice.pantry.upsert('allulose', 1, 'cup', when);
    const plan = await alice.plan.addEntry('2026-10-05', recipe.id, 'dinner', when);
    await alice.plan.saveShoppingList(
      {
        id: 'week',
        weekStart: '2026-10-05',
        createdAt: when.toISOString(),
        updatedAt: when.toISOString(),
        items: [
          {
            id: 'shop-1',
            weekStart: '2026-10-05',
            text: '1 cup allulose',
            name: 'allulose',
            checked: false,
            recipeIds: [recipe.id],
            createdAt: when.toISOString(),
            updatedAt: when.toISOString(),
          },
        ],
      },
      when,
    );
    await alice.collections.barcode_items.save(
      {
        id: 'barcode-1',
        barcode: '0123456789055',
        name: 'Allulose',
        source: 'user',
        createdAt: when.toISOString(),
        updatedAt: when.toISOString(),
      } as never,
      when,
    );

    const engineA = createSyncEngine({ ...alice, remote, householdId: HH, userId: 'alice', now: () => when });
    const engineB = createSyncEngine({ ...bob, remote, householdId: HH, userId: 'bob', now: () => when });
    await engineA.syncOnce();
    await engineB.syncOnce();

    const authored: { table: SyncTable; id: string; extra?: Record<string, unknown> }[] = [
      { table: 'recipes', id: recipe.id, extra: { title: recipe.title } },
      { table: 'categories', id: category.id, extra: { name: 'Dinner' } },
      { table: 'pantry_items', id: pantry.id, extra: { name: 'allulose' } },
      { table: 'meal_plan_entries', id: plan.id, extra: { recipe_id: recipe.id } },
      { table: 'shopping_items', id: 'shop-1', extra: { week_start: '2026-10-05', checked: false } },
      { table: 'barcode_items', id: 'barcode-1', extra: { barcode: '0123456789055', name: 'Allulose' } },
    ];
    for (const { table, id, extra } of authored) {
      const row = remote.rows.get(table)!.get(id);
      expect(row).toMatchObject({ household_id: HH, created_by: 'alice', deleted_at: null, ...extra });
      expect(row?.data).not.toHaveProperty('householdId');
      expect(row?.data).not.toHaveProperty('createdBy');
      expect(fromRow(row!)).toMatchObject({ householdId: HH, createdBy: 'alice' });
    }

    expect((await bob.recipes.get(recipe.id))?.createdBy).toBe('alice');
    expect((await bob.recipes.listCategories()).map((c) => c.name)).toEqual(['Dinner']);
    expect((await bob.pantry.list()).map((p) => p.name)).toEqual(['allulose']);
    expect((await bob.plan.entriesForDates(['2026-10-05'])).map((e) => e.recipeId)).toEqual([recipe.id]);
    expect((await bob.plan.getShoppingList('2026-10-05'))?.items.map((i) => i.text)).toEqual(['1 cup allulose']);
    const alias = (await bob.collections.barcode_items.all()).find((i) => i.id === 'barcode-1') as
      | { name?: string; createdBy?: string; householdId?: string }
      | undefined;
    expect(alias).toMatchObject({ name: 'Allulose', createdBy: 'alice', householdId: HH });
  });
});
