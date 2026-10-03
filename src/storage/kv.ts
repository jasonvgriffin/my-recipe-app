import AsyncStorage from '@react-native-async-storage/async-storage';

/** Minimal key-value interface so storage can be swapped (tests, SQLite, sync backend). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const defaultStore: KeyValueStore = AsyncStorage;

/**
 * A JSON array of `{ id }` records stored under one key. Invalid entries are dropped
 * (or upgraded via `migrate`) on read so corrupt data never crashes the app.
 */
export function createCollection<T extends { id: string }>(
  store: KeyValueStore,
  key: string,
  migrate: (value: unknown) => T | undefined,
) {
  async function all(): Promise<T[]> {
    const raw = await store.getItem(key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(migrate).filter((v): v is T => v !== undefined);
    } catch {
      return [];
    }
  }
  async function replaceAll(items: T[]): Promise<void> {
    await store.setItem(key, JSON.stringify(items));
  }
  return {
    all,
    replaceAll,
    async get(id: string): Promise<T | undefined> {
      return (await all()).find((x) => x.id === id);
    },
    /** Insert or replace by id. */
    async save(item: T): Promise<void> {
      const items = await all();
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items[idx] = item;
      else items.push(item);
      await replaceAll(items);
    },
    async remove(id: string): Promise<void> {
      await replaceAll((await all()).filter((x) => x.id !== id));
    },
  };
}
