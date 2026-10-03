/**
 * Barcode → product lookup (spec #27). UI-free: the camera screen (expo-camera barcode scanning:
 * EAN-13, EAN-8, UPC-A, UPC-E) passes the scanned code here, then adds/increments the pantry item.
 *
 * Order: household-shared local mapping (incl. cached Open Food Facts results and user-typed names)
 * → Open Food Facts API (free, no key) → not found / offline → caller asks the user for a name once and
 * calls `saveUserProduct`, which is stored household-wide so nobody has to type it again.
 */
import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import type { Collection } from '@/storage/kv';
import type { SyncMeta } from '@/types/sync';

export const OFF_USER_AGENT = 'MyRecipeApp/1.0 (github.com/jasonvgriffin)';
export const OFF_PRODUCT_URL = (barcode: string) =>
  `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=code,product_name,brands,quantity,image_front_url,image_url,nutriments`;

export interface NutritionPer100g {
  calories?: number;
  carbsG?: number;
  fiberG?: number;
  /** carbs − fiber when both known. */
  netCarbsG?: number;
  proteinG?: number;
  fatG?: number;
  sugarsG?: number;
}

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  /** Package size as printed, e.g. "500 g". */
  quantity?: string;
  imageUrl?: string;
  nutritionPer100g?: NutritionPer100g;
}

/** Household-shared barcode mapping record (synced table `barcode_items`). id = barcode-derived UUID-free key. */
export interface BarcodeItem extends SyncMeta, BarcodeProduct {
  source: 'openfoodfacts' | 'user';
}

export type BarcodeLookupResult =
  | { status: 'found'; source: 'cache' | 'openfoodfacts'; product: BarcodeProduct }
  | { status: 'not_found'; barcode: string } // ask the user for a name → saveUserProduct
  | { status: 'offline'; barcode: string; error: string } // same UX; retry later is optional
  | { status: 'invalid'; barcode: string; error: string }
  | { status: 'locked'; barcode: string; error: string }; // barcodeScan gated off (src/entitlements)

export interface BarcodeDeps {
  /** Household-shared mapping store. */
  items: Collection<BarcodeItem>;
  fetchJson: (url: string, headers: Record<string, string>) => Promise<{ status: number; json: unknown }>;
  newId: () => string;
  now?: () => Date;
  /** Feature gate (paywall-ready). Defaults to the app-wide gate. */
  canUse?: CanUse;
}

/** Normalize and validate EAN-13 / EAN-8 / UPC-A (12) / UPC-E (8) codes (check digit verified for 8/12/13). */
export function normalizeBarcode(raw: string): string | undefined {
  const code = raw.replace(/\D/g, '');
  if (![8, 12, 13].includes(code.length)) return undefined;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== check) {
    // UPC-E check digits are computed on the expanded UPC-A; accept 8-digit codes starting with 0/1 as UPC-E.
    if (!(code.length === 8 && /^[01]/.test(code))) return undefined;
  }
  // Store UPC-A as EAN-13 (leading 0) so the same product matches either scan.
  return code.length === 12 ? `0${code}` : code;
}

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;

/** Map an Open Food Facts v2 product response to BarcodeProduct (undefined if not found). */
export function parseOpenFoodFacts(barcode: string, json: unknown): BarcodeProduct | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const body = json as { status?: number; product?: Record<string, unknown> };
  const p = body.product;
  if (body.status !== 1 || !p) return undefined;
  const name = typeof p.product_name === 'string' ? p.product_name.trim() : '';
  if (!name) return undefined;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal =
    num(n['energy-kcal_100g']) ??
    (num(n.energy_100g) !== undefined ? Math.round(num(n.energy_100g)! / 4.184) : undefined);
  const nutrition: NutritionPer100g = {
    calories: kcal,
    carbsG: num(n.carbohydrates_100g),
    fiberG: num(n.fiber_100g),
    proteinG: num(n.proteins_100g),
    fatG: num(n.fat_100g),
    sugarsG: num(n.sugars_100g),
  };
  if (nutrition.carbsG !== undefined && nutrition.fiberG !== undefined)
    nutrition.netCarbsG = Math.max(0, +(nutrition.carbsG - nutrition.fiberG).toFixed(1));
  const cleaned = Object.fromEntries(Object.entries(nutrition).filter(([, v]) => v !== undefined)) as NutritionPer100g;
  const brand = typeof p.brands === 'string' ? p.brands.split(',')[0].trim() : undefined;
  const image =
    typeof p.image_front_url === 'string'
      ? p.image_front_url
      : typeof p.image_url === 'string'
        ? p.image_url
        : undefined;
  return {
    barcode,
    name,
    ...(brand ? { brand } : {}),
    ...(typeof p.quantity === 'string' && p.quantity.trim() ? { quantity: p.quantity.trim() } : {}),
    ...(image ? { imageUrl: image } : {}),
    ...(Object.keys(cleaned).length ? { nutritionPer100g: cleaned } : {}),
  };
}

export function createBarcodeLookup({
  items,
  fetchJson,
  newId,
  now = () => new Date(),
  canUse = defaultCanUse,
}: BarcodeDeps) {
  async function findLocal(barcode: string) {
    return (await items.all()).find((i) => i.barcode === barcode);
  }
  async function store(product: BarcodeProduct, source: BarcodeItem['source']): Promise<BarcodeItem> {
    const existing = await findLocal(product.barcode);
    const ts = now().toISOString();
    return items.save(
      {
        ...existing,
        ...product,
        source,
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      },
      now(),
    );
  }
  const strip = (i: BarcodeItem): BarcodeProduct => {
    const { barcode, name, brand, quantity, imageUrl, nutritionPer100g } = i;
    return { barcode, name, brand, quantity, imageUrl, nutritionPer100g };
  };

  return {
    async lookup(rawBarcode: string): Promise<BarcodeLookupResult> {
      if (!canUse('barcodeScan'))
        return { status: 'locked', barcode: rawBarcode, error: 'Barcode scanning is not available.' };
      const barcode = normalizeBarcode(rawBarcode);
      if (!barcode) return { status: 'invalid', barcode: rawBarcode, error: 'Not a valid EAN/UPC barcode.' };
      const cached = await findLocal(barcode);
      if (cached) return { status: 'found', source: 'cache', product: strip(cached) };
      let res: { status: number; json: unknown };
      try {
        res = await fetchJson(OFF_PRODUCT_URL(barcode), { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' });
      } catch (e) {
        return { status: 'offline', barcode, error: String(e) };
      }
      if (res.status === 404) return { status: 'not_found', barcode };
      if (res.status >= 400) return { status: 'offline', barcode, error: `HTTP ${res.status}` };
      const product = parseOpenFoodFacts(barcode, res.json);
      if (!product) return { status: 'not_found', barcode };
      await store(product, 'openfoodfacts');
      return { status: 'found', source: 'openfoodfacts', product };
    },
    /** Save a user-typed name for an unknown/offline barcode (household-shared from then on). */
    async saveUserProduct(
      rawBarcode: string,
      name: string,
      extra: Partial<BarcodeProduct> = {},
    ): Promise<BarcodeProduct> {
      const barcode = normalizeBarcode(rawBarcode) ?? rawBarcode.replace(/\D/g, '');
      if (!name.trim()) throw new Error('Name is required.');
      return strip(await store({ ...extra, barcode, name: name.trim() }, 'user'));
    },
  };
}

export type BarcodeLookup = ReturnType<typeof createBarcodeLookup>;
