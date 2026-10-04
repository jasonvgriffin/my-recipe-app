/**
 * Who is writing (spec #25). Offline / signed out = undefined. The sync layer (src/sync) sets this after
 * sign-in; stores stamp new records with it. v1.0.6: household sharing was removed, so there is no household id.
 */
export interface Identity {
  userId?: string;
}

let current: Identity = {};
const listeners = new Set<(i: Identity) => void>();

export function getIdentity(): Identity {
  return current;
}

export function setIdentity(next: Identity): void {
  current = { userId: next.userId };
  listeners.forEach((l) => l(current));
}

export function onIdentityChange(listener: (i: Identity) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
