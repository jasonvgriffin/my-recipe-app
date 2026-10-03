import AsyncStorage from '@react-native-async-storage/async-storage';

import { getIdentity } from './identity';
import { notifyDataChange } from './writes';

/** Minimal key-value interface so storage can be swapped (tests, SQLite, sync backend). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const defaultStore: KeyValueStore = AsyncStorage;

/** Minimum shape of a record stored in a collection. Sync fields are optional for local-only data. */
export interface StoredRecord {
  id: string;
  updatedAt?: string;
  deletedAt?: string;
  householdId?: string;
  createdBy?: string;
}

/**
 * Repository over one record type — the interface the UI stores AND the sync engine use (spec #25).
 * A different backing store (SQLite, server DB) only needs to implement this.
 */
export interface Collection<T extends StoredRecord> {
  /** Live (non-deleted) records. */
  all(): Promise<T[]>;
  /** Everything including tombstones (for sync). */
  allRaw(): Promise<T[]>;
  replaceAll(items: T[]): Promise<void>;
  get(id: string): Promise<T | undefined>;
  /** Local write: stamps updatedAt (and householdId/createdBy from the current identity if unset). */
  save(item: T, now?: Date): Promise<T>;
  /** Soft delete (tombstone). */
  remove(id: string, now?: Date): Promise<void>;
  /** Records (incl. tombstones) changed after `sinceIso` — what to push. */
  changesSince(sinceIso: string | undefined): Promise<T[]>;
  /** Merge remote records, last-write-wins by updatedAt. Returns how many were applied. */
  applyRemote(items: T[]): Promise<number>;
  /** Drop tombstones older than `beforeIso` (after they've been synced). */
  purgeTombstones(beforeIso: string): Promise<number>;
}

/**
 * A JSON array of records stored under one key. Invalid entries are dropped
 * (or upgraded via `migrate`) on read so corrupt data never crashes the app.
 */
export function createCollection<T extends StoredRecord>(
  store: KeyValueStore,
  key: string,
  migrate: (value: unknown) => T | undefined,
): Collection<T> {
  async function allRaw(): Promise<T[]> {
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
  const live = (items: T[]) => items.filter((x) => !x.deletedAt);

  return {
    allRaw,
    replaceAll,
    async all() {
      return live(await allRaw());
    },
    async get(id) {
      return live(await allRaw()).find((x) => x.id === id);
    },
    async save(item, now = new Date()) {
      const { userId, householdId } = getIdentity();
      const stamped: T = {
        ...item,
        updatedAt: now.toISOString(),
        householdId: item.householdId ?? householdId,
        createdBy: item.createdBy ?? userId,
      };
      if (stamped.householdId === undefined) delete stamped.householdId;
      if (stamped.createdBy === undefined) delete stamped.createdBy;
      const items = await allRaw();
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items[idx] = stamped;
      else items.push(stamped);
      await replaceAll(items);
      notifyDataChange();
      return stamped;
    },
    async remove(id, now = new Date()) {
      const ts = now.toISOString();
      await replaceAll((await allRaw()).map((x) => (x.id === id ? { ...x, deletedAt: ts, updatedAt: ts } : x)));
      notifyDataChange();
    },
    async changesSince(sinceIso) {
      const items = await allRaw();
      return sinceIso ? items.filter((x) => (x.updatedAt ?? '') > sinceIso) : items;
    },
    async applyRemote(remote) {
      const items = await allRaw();
      const byId = new Map(items.map((x, i) => [x.id, i]));
      let applied = 0;
      for (const r of remote) {
        const idx = byId.get(r.id);
        if (idx === undefined) {
          byId.set(r.id, items.push(r) - 1);
          applied++;
        } else if ((r.updatedAt ?? '') > (items[idx].updatedAt ?? '')) {
          items[idx] = r;
          applied++;
        }
      }
      if (applied) {
        await replaceAll(items);
        notifyDataChange();
      }
      return applied;
    },
    async purgeTombstones(beforeIso) {
      const items = await allRaw();
      const kept = items.filter((x) => !x.deletedAt || x.deletedAt >= beforeIso);
      if (kept.length !== items.length) await replaceAll(kept);
      return items.length - kept.length;
    },
  };
}
