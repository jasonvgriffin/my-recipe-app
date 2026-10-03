/**
 * Who is writing, and into which household (spec #25). Solo/offline mode = both undefined.
 * The sync layer (src/sync) sets this after sign-in / joining a household; stores stamp new records with it.
 */
export interface Identity {
  userId?: string;
  householdId?: string;
}

let current: Identity = {};
const listeners = new Set<(i: Identity) => void>();

export function getIdentity(): Identity {
  return current;
}

export function setIdentity(next: Identity): void {
  current = { ...next };
  listeners.forEach((l) => l(current));
}

export function onIdentityChange(listener: (i: Identity) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
