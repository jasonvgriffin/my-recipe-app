/**
 * Backup & restore (v1.0.6, docs/BACKUP.md): one versioned file with every collection, photos and settings;
 * preview, merge or replace; offline, no account.
 */
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  createBackup,
  parseBackup,
  restoreBackup,
  type BackupCollections,
  type BackupDeps,
  type PhotoStore,
} from '@/backup';
import { createCollection, type Collection, type KeyValueStore, type StoredRecord } from '@/storage/kv';
import { setIdentity } from '@/storage/identity';
import { createMealPlanStore } from '@/storage/meal-plan';
import { createPantryStore } from '@/storage/pantry';
import { createRecipeStore } from '@/storage/recipes';
import { createSettingsStore } from '@/storage/settings';
import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

function memoryPhotos(): PhotoStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    isLocal: (uri) => uri.startsWith('file:///docs/recipe-photos/'),
    read: async (uri) => files.get(uri),
    write: async (name, base64) => {
      const uri = `file:///docs/recipe-photos/${name}`;
      files.set(uri, base64);
      return uri;
    },
  };
}

function phone() {
  const kv = memoryStore();
  const recipes = createRecipeStore(kv);
  const plan = createMealPlanStore(kv);
  const pantry = createPantryStore(kv);
  const settings = createSettingsStore(kv);
  const photos = memoryPhotos();
  const c = <T extends StoredRecord>(col: Collection<T>) => col as unknown as Collection<StoredRecord>;
  const collections: BackupCollections = {
    recipes: c(recipes.collections.recipes),
    categories: c(recipes.collections.categories),
    pantry_items: c(pantry.collection),
    meal_plan_entries: c(plan.collections.entries),
    shopping_items: c(plan.collections.items),
    barcode_items: c(createCollection<StoredRecord>(kv, 'barcodes', (v) => v as StoredRecord)),
  };
  const deps: BackupDeps = { collections, settings, photos, appVersion: '1.0.6', now: () => new Date('2026-10-04T12:00:00Z') };
  return { kv, recipes, plan, pantry, settings, photos, collections, deps };
}

const at = (iso: string) => new Date(iso);

afterEach(() => setIdentity({}));

async function fullPhone() {
  const old = phone();
  setIdentity({ userId: 'old-user' });
  const dinner = await old.recipes.addCategory('Dinner', at('2026-10-01T09:00:00Z'));
  const weeknight = await old.recipes.addCategory('Weeknight', at('2026-10-01T09:00:00Z'));
  const chicken = await old.recipes.save(
    { ...SAMPLE_RECIPES[0], categoryIds: [dinner.id, weeknight.id], rating: 5, tags: ['weeknight'], photoUri: 'file:///docs/recipe-photos/seed-lemon-herb-chicken.jpg', cooked: true, lastCookedAt: '2026-10-02T18:00:00.000Z', cookedDates: ['2026-10-02T18:00:00.000Z'] } as never,
    at('2026-10-01T10:00:00Z'),
  );
  old.photos.files.set('file:///docs/recipe-photos/seed-lemon-herb-chicken.jpg', 'QUJD');
  const web = await old.recipes.save({ ...SAMPLE_RECIPES[1], photoUri: 'https://example.com/p.jpg' } as never, at('2026-10-01T10:00:00Z'));
  await old.plan.addEntry('2026-10-05', chicken.id, 'dinner', at('2026-10-01T11:00:00Z'));
  await old.pantry.upsert('allulose', 1, 'cup', at('2026-10-01T11:00:00Z'));
  const gone = await old.recipes.save({ ...SAMPLE_RECIPES[1], id: 'gone-1', title: 'Deleted' } as never, at('2026-10-01T10:00:00Z'));
  await old.recipes.remove(gone.id);
  await old.settings.update({ unitSystem: 'metric', appearance: { themeMode: 'dark', accent: 'orange' } as never });
  setIdentity({});
  return { old, chicken, web, dinner, gone };
}

describe('backup file', () => {
  it('exports everything into one versioned, portable file (no deleted records, no account stamps)', async () => {
    const { old, chicken, web, gone } = await fullPhone();
    const backup = await createBackup(old.deps);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: BACKUP_VERSION, appVersion: '1.0.6', exportedAt: '2026-10-04T12:00:00.000Z' });
    expect(backup.data.recipes.map((r) => r.id).sort()).toEqual([chicken.id, web.id].sort());
    expect(backup.data.recipes.some((r) => r.id === gone.id)).toBe(false);
    const c = backup.data.recipes.find((r) => r.id === chicken.id)!;
    expect(c).toMatchObject({ rating: 5, tags: ['weeknight'], cooked: true, cookedDates: ['2026-10-02T18:00:00.000Z'] });
    expect(c).not.toHaveProperty('householdId');
    expect(c).not.toHaveProperty('createdBy');
    expect(backup.photos[chicken.id]).toEqual({ name: 'seed-lemon-herb-chicken.jpg', base64: 'QUJD' });
    expect(backup.photos[web.id]).toBeUndefined(); // web photo stays a URL
    expect(backup.data.categories.map((x) => x.name)).toContain('Dinner');
    expect(backup.data.meal_plan_entries).toHaveLength(1);
    expect(backup.data.pantry_items).toHaveLength(1);
    expect(backup.settings).toMatchObject({ unitSystem: 'metric', appearance: { themeMode: 'dark', accent: 'orange' } });
    expect(backupFileName(new Date('2026-10-04T12:00:00Z'))).toBe('My-Recipe-App-backup-2026-10-04.myrecipe');

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.summary).toMatchObject({ recipes: 2, photos: 1, mealPlanEntries: 1, pantryItems: 1, hasSettings: true });
  });

  it('rejects files that are not backups, damaged, or from a newer app version', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'This is not a My Recipe App backup file.' });
    expect(parseBackup('{"format":"other"}')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION + 1 }))).toEqual({
      ok: false,
      error: 'This backup was made by a newer version of My Recipe App. Update the app, then try again.',
    });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: 'x', data: { recipes: [{ title: 'no id' }] } }))).toEqual({
      ok: false,
      error: 'This backup file is damaged or incomplete.',
    });
    // Missing optional collections default to empty.
    const minimal = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-10-04T00:00:00Z', data: {} }));
    expect(minimal.ok && minimal.summary.recipes).toBe(0);
  });
});

describe('restore', () => {
  it('restores onto a new phone (merge): photos rewritten, default categories reused, settings restored, stamped for the new account', async () => {
    const { old, chicken, web } = await fullPhone();
    const file = JSON.stringify(await createBackup(old.deps));
    const fresh = phone();
    const freshDinner = await fresh.recipes.addCategory('Dinner', at('2026-10-04T08:00:00Z')); // seeded on the new phone
    setIdentity({ userId: 'new-user' });
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.error);
    const result = await restoreBackup(parsed.backup, 'merge', fresh.deps);
    expect(result).toMatchObject({ photos: 1, settings: true, removed: 0 });
    const restored = await fresh.recipes.get(chicken.id);
    expect(restored).toMatchObject({ title: chicken.title, rating: 5, cooked: true, createdBy: 'new-user' });
    expect(restored?.householdId).toBeUndefined();
    expect(restored?.photoUri).toBe('file:///docs/recipe-photos/seed-lemon-herb-chicken.jpg');
    expect(fresh.photos.files.get(restored!.photoUri!)).toBe('QUJD');
    // Several categories survive (v1.0.6): the reused default by its new id, the other one as backed up.
    const freshWeeknight = (await fresh.recipes.listCategories()).find((c) => c.name === 'Weeknight')!;
    expect(restored?.categoryIds).toEqual([freshDinner.id, freshWeeknight.id]);
    expect((await fresh.recipes.listCategories()).filter((c) => c.name === 'Dinner')).toHaveLength(1);
    expect((await fresh.recipes.get(web.id))?.photoUri).toBe('https://example.com/p.jpg');
    expect((await fresh.plan.entriesForDates(['2026-10-05'])).map((e) => e.recipeId)).toEqual([chicken.id]);
    expect((await fresh.pantry.list()).map((p) => p.name)).toEqual(['allulose']);
    expect(await fresh.settings.get()).toMatchObject({ unitSystem: 'metric', appearance: { themeMode: 'dark', accent: 'orange' } });
  });

  it('merge keeps the newer copy and this phone’s own records', async () => {
    const { old, chicken } = await fullPhone();
    const backup = await createBackup(old.deps);
    const mine = phone();
    await mine.recipes.save({ ...chicken, title: 'My newer title' } as never, at('2026-10-03T10:00:00Z'));
    const own = await mine.recipes.save({ ...SAMPLE_RECIPES[1], id: 'own-1', title: 'Only on this phone' } as never, at('2026-10-03T10:00:00Z'));
    const r = await restoreBackup(backup, 'merge', mine.deps);
    expect(r.kept).toBeGreaterThanOrEqual(1);
    expect((await mine.recipes.get(chicken.id))?.title).toBe('My newer title');
    expect(await mine.recipes.get(own.id)).toBeTruthy();
  });

  it('replace makes the phone match the backup (tombstones, so sync removes them too) and ignores unknown settings', async () => {
    const { old, chicken } = await fullPhone();
    const backup = await createBackup(old.deps);
    backup.settings = { ...backup.settings, bogus: 'x' };
    const mine = phone();
    const own = await mine.recipes.save({ ...SAMPLE_RECIPES[1], id: 'own-1', title: 'Only on this phone' } as never, at('2026-10-03T10:00:00Z'));
    const r = await restoreBackup(backup, 'replace', mine.deps);
    expect(r.removed).toBeGreaterThanOrEqual(1);
    expect(await mine.recipes.get(own.id)).toBeUndefined();
    expect((await mine.recipes.collections.recipes.allRaw()).find((x) => x.id === own.id)?.deletedAt).toBeTruthy();
    expect(await mine.recipes.get(chicken.id)).toBeTruthy();
    expect(await mine.settings.get()).not.toHaveProperty('bogus');
  });
});
