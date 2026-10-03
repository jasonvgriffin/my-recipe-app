/**
 * Feature registry for paywall-ready gating (docs/SPEC.md "Paywall-ready feature gating", docs/DESIGN.md §8).
 *
 * Every OPTIONAL feature has a FeatureId. Core recipe CRUD / view / search is deliberately NOT here and must
 * never be gated (RECIPES ARE THE CORE). Adding a new optional feature = add an id + registry entry + config
 * row, then route every entry point (tab, button, deep link, sync, module call) through the gate.
 */
export const FeatureId = {
  mealPlan: 'mealPlan',
  shoppingList: 'shoppingList',
  groceryRun: 'groceryRun',
  pantry: 'pantry',
  barcodeScan: 'barcodeScan',
  householdSync: 'householdSync',
  cookingMode: 'cookingMode',
  cookWithMe: 'cookWithMe',
  timers: 'timers',
  unitConversion: 'unitConversion',
  tags: 'tags',
  categories: 'categories',
  ratings: 'ratings',
  share: 'share',
  /** Export recipes as a printable PDF and share it (v1.0.3). Builds on `share`. */
  pdfExport: 'pdfExport',
  photos: 'photos',
  linkImport: 'linkImport',
  /** Remote MCP server (spec #28, docs/MCP.md): assistant read/write access. Checked server-side; no in-app UI. */
  mcpAccess: 'mcpAccess',
} as const;
// eslint-disable-next-line @typescript-eslint/no-redeclare -- const + type pair (enum-like)
export type FeatureId = (typeof FeatureId)[keyof typeof FeatureId];

export const ALL_FEATURE_IDS = Object.values(FeatureId) as FeatureId[];

export interface FeatureInfo {
  id: FeatureId;
  label: string;
  /** SPEC.md item number(s). */
  spec: number[];
  /** Features this one builds on: a feature is only available when its parents are (e.g. barcodeScan → pantry). */
  requires?: FeatureId[];
}

export const FEATURES: Record<FeatureId, FeatureInfo> = {
  mealPlan: { id: 'mealPlan', label: 'Meal plan', spec: [11] },
  shoppingList: { id: 'shoppingList', label: 'Shopping list', spec: [12] },
  groceryRun: { id: 'groceryRun', label: 'Shopping List mode', spec: [18] },
  pantry: { id: 'pantry', label: 'Pantry', spec: [21] },
  // Pantry and shopping list both scan (v1.0.1), so barcodeScan no longer requires pantry; each entry point
  // also needs its own screen's feature (pantry / shoppingList) to be visible.
  barcodeScan: { id: 'barcodeScan', label: 'Barcode scanning', spec: [27] },
  householdSync: { id: 'householdSync', label: 'Household sharing', spec: [25] },
  cookingMode: { id: 'cookingMode', label: 'Cooking mode', spec: [19] },
  cookWithMe: { id: 'cookWithMe', label: 'Cook-with-me (voice assistant)', spec: [24] },
  timers: { id: 'timers', label: 'Step timers', spec: [15] },
  unitConversion: { id: 'unitConversion', label: 'Unit conversion', spec: [16] },
  tags: { id: 'tags', label: 'Tags', spec: [20] },
  categories: { id: 'categories', label: 'Categories', spec: [3] },
  ratings: { id: 'ratings', label: 'Ratings', spec: [22] },
  share: { id: 'share', label: 'Share', spec: [14] },
  pdfExport: { id: 'pdfExport', label: 'Export PDF', spec: [14], requires: ['share'] },
  photos: { id: 'photos', label: 'Recipe photos', spec: [4] },
  linkImport: { id: 'linkImport', label: 'Import from link / text', spec: [1] },
  mcpAccess: { id: 'mcpAccess', label: 'AI assistant access (MCP server)', spec: [28] },
};

export type FeatureTier = 'free' | 'premium';

export interface FeatureConfig {
  tier: FeatureTier;
  /** Kill switch (e.g. remote config): false = unavailable to everyone, regardless of entitlements. */
  enabled: boolean;
}

/** v1: everything free and enabled. Flip a row to `premium` to paywall it later — no other code changes. */
export const DEFAULT_FEATURE_CONFIG: Record<FeatureId, FeatureConfig> = Object.fromEntries(
  ALL_FEATURE_IDS.map((id) => [id, { tier: 'free', enabled: true }]),
) as Record<FeatureId, FeatureConfig>;
