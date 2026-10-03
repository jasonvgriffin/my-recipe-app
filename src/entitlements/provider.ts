import type { FeatureId } from './features';

/**
 * Who has paid for what. v1 ships LocalFreeEntitlements (grants everything). Future implementations:
 * Google Play / App Store billing, RevenueCat, or a Supabase `entitlements` table keyed by user/household.
 * Providers answer only "does the user hold the entitlement for this premium feature?" — tier/kill-switch
 * logic lives in the gate.
 */
export interface EntitlementProvider {
  readonly name: string;
  /** Synchronous so UI and modules can check cheaply; providers cache and refresh in the background. */
  hasPremium(feature: FeatureId): boolean;
  /** Notify when entitlements change (purchase, restore, expiry). Returns unsubscribe. */
  subscribe?(listener: () => void): () => void;
  /** Re-fetch from the backing store. */
  refresh?(): Promise<void>;
}

/** v1 provider: no billing, every feature granted. */
export class LocalFreeEntitlements implements EntitlementProvider {
  readonly name = 'local-free';
  hasPremium(): boolean {
    return true;
  }
}

/** A user with no purchases (for tests and for previewing a future paywall). */
export class NoEntitlements implements EntitlementProvider {
  readonly name = 'none';
  hasPremium(): boolean {
    return false;
  }
}

/** Grants a fixed set of premium features (tests, promo codes, a cached server answer). */
export class StaticEntitlements implements EntitlementProvider {
  readonly name = 'static';
  constructor(private readonly granted: Iterable<FeatureId>) {}
  hasPremium(feature: FeatureId): boolean {
    return new Set(this.granted).has(feature);
  }
}
