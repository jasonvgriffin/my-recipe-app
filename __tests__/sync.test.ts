import { SEED_RECIPES } from '@/data/seed';
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
    const solo = await alice.recipes.save({ ...SEED_RECIPES[0] }, at('2026-10-01T10:00:00Z'));
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
});
