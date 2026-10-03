/**
 * Change bus for on-device records (spec #25).
 * User edits emit `local` (the sync coordinator debounces a push).
 * A sync pass runs inside `withoutSyncNotify` so its own saves are not treated as new edits;
 * one `remote` event fires afterwards so screens can reload.
 */

export type DataChangeSource = 'local' | 'remote';

type Listener = (source: DataChangeSource) => void;

const listeners = new Set<Listener>();
let suppressDepth = 0;
let remoteDirty = false;

export function onDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(source: DataChangeSource): void {
  for (const listener of listeners) listener(source);
}

/** Call after a user-driven collection write. */
export function notifyDataChange(): void {
  if (suppressDepth > 0) {
    remoteDirty = true;
    return;
  }
  emit('local');
}

/** Run `fn` without scheduling sync for the writes it makes. Emits one `remote` event if anything changed. */
export async function withoutSyncNotify<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth += 1;
  try {
    return await fn();
  } finally {
    suppressDepth -= 1;
    if (suppressDepth === 0 && remoteDirty) {
      remoteDirty = false;
      emit('remote');
    }
  }
}
