import { ALL_FEATURE_IDS, DEFAULT_FEATURE_CONFIG, FEATURES, type FeatureConfig, type FeatureId } from './features';
import { LocalFreeEntitlements, type EntitlementProvider } from './provider';

/**
 * The feature gate. UI-free: UI uses useFeature()/<FeatureGate>; modules (import, cooking, sync, pantry)
 * call canUse(). Separate from the user's show/hide toggles in Settings (AppSettings.features): the gate says
 * whether a feature MAY be used; the toggle says whether the user WANTS to see it. Entry points need both.
 */
export type FeatureLockReason = 'disabled' | 'premium' | 'requires';

export type FeatureAccess =
  { available: true; reason?: undefined } | { available: false; reason: FeatureLockReason; message: string };

export class FeatureLockedError extends Error {
  constructor(
    readonly feature: FeatureId,
    readonly reason: FeatureLockReason,
  ) {
    super(`${FEATURES[feature].label} is not available (${reason}).`);
    this.name = 'FeatureLockedError';
  }
}

export function createFeatureGate(
  options: { config?: Partial<Record<FeatureId, FeatureConfig>>; provider?: EntitlementProvider } = {},
) {
  let config: Record<FeatureId, FeatureConfig> = { ...DEFAULT_FEATURE_CONFIG, ...options.config };
  let provider: EntitlementProvider = options.provider ?? new LocalFreeEntitlements();
  let unsubscribeProvider: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function attach(p: EntitlementProvider) {
    unsubscribeProvider?.();
    provider = p;
    unsubscribeProvider = p.subscribe?.(notify);
  }
  attach(provider);

  function check(id: FeatureId, seen: Set<FeatureId> = new Set()): FeatureAccess {
    const info = FEATURES[id];
    const cfg = config[id];
    if (!info || !cfg) return { available: false, reason: 'disabled', message: `Unknown feature ${String(id)}` };
    if (!cfg.enabled) return { available: false, reason: 'disabled', message: `${info.label} is turned off.` };
    if (cfg.tier === 'premium' && !provider.hasPremium(id)) {
      return { available: false, reason: 'premium', message: `${info.label} is a premium feature.` };
    }
    seen.add(id);
    for (const parent of info.requires ?? []) {
      if (seen.has(parent)) continue;
      const p = check(parent, seen);
      if (!p.available) {
        return { available: false, reason: 'requires', message: `${info.label} needs ${FEATURES[parent].label}.` };
      }
    }
    return { available: true };
  }

  return {
    check: (id: FeatureId) => check(id),
    canUse: (id: FeatureId) => check(id).available,
    /** Throws FeatureLockedError when unavailable — for module entry points that can't return a result. */
    assert(id: FeatureId) {
      const a = check(id);
      if (!a.available) throw new FeatureLockedError(id, a.reason);
    },
    availableFeatures: () => ALL_FEATURE_IDS.filter((id) => check(id).available),
    getConfig: () => config,
    setConfig(next: Partial<Record<FeatureId, Partial<FeatureConfig>>>) {
      const merged = { ...config };
      for (const [id, c] of Object.entries(next) as [FeatureId, Partial<FeatureConfig>][]) {
        merged[id] = { ...merged[id], ...c };
      }
      config = merged;
      notify();
    },
    resetConfig() {
      config = { ...DEFAULT_FEATURE_CONFIG };
      notify();
    },
    getProvider: () => provider,
    setProvider(p: EntitlementProvider) {
      attach(p);
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type FeatureGate = ReturnType<typeof createFeatureGate>;

/** App-wide gate. Swap the provider at startup when billing exists; tests flip config/provider directly. */
export const featureGate: FeatureGate = createFeatureGate();

export const canUse = (id: FeatureId): boolean => featureGate.canUse(id);
export const checkFeature = (id: FeatureId): FeatureAccess => featureGate.check(id);
export type CanUse = (id: FeatureId) => boolean;
