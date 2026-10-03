import { normalizeAlias } from '@/receipts/match';
import { ingredientKey } from '@/lib/ingredients';
import { uuid } from '@/lib/ids';
import type { SyncMeta } from '@/types/sync';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export const RECEIPT_ALIASES_STORAGE_KEY = 'my-recipe-app/receipt-aliases/v1';

/**
 * Household-shared receipt shorthand → pantry name (spec #26).
 * Saved when someone corrects a match ("gv bnls chkn" → "chicken breast").
 * Synced table `receipt_aliases`.
 */
export interface ReceiptAlias extends SyncMeta {
  /** Normalized receipt product text. */
  alias: string;
  /** Pantry item name the household chose. */
  name: string;
}

function isReceiptAlias(v: unknown): v is ReceiptAlias {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return typeof a.id === 'string' && typeof a.alias === 'string' && typeof a.name === 'string';
}

export function createReceiptAliasStore(store: KeyValueStore = defaultStore) {
  const items = createCollection<ReceiptAlias>(store, RECEIPT_ALIASES_STORAGE_KEY, (v) =>
    isReceiptAlias(v) ? v : undefined,
  );
  return {
    list: () => items.all(),
    /**
     * Upsert by normalized alias. Later corrections overwrite the name (last write wins locally;
     * sync still last-write-wins by updatedAt across the household).
     */
    async remember(alias: string, name: string, now: Date = new Date()): Promise<ReceiptAlias> {
      const key = normalizeAlias(alias);
      const target = ingredientKey({ text: name });
      if (!key) throw new Error('Alias text is required.');
      if (!target) throw new Error('Pantry name is required.');
      const existing = (await items.all()).find((row) => row.alias === key);
      const ts = now.toISOString();
      return items.save(
        {
          ...existing,
          id: existing?.id ?? uuid(),
          alias: key,
          name: target,
          createdAt: existing?.createdAt ?? ts,
          updatedAt: ts,
        },
        now,
      );
    },
    collection: items,
  };
}

export const receiptAliasStore = createReceiptAliasStore();
