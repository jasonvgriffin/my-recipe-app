import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import { ingredientKey } from '@/lib/ingredients';

import type { ApplyReceiptResult, ReviewLine } from './types';

export interface ApplyReceiptDeps {
  /** Increment (or create) a pantry item. Quantity is added to what's already on hand. */
  addQuantity: (input: { name: string; quantity: number; unit?: string }) => Promise<unknown>;
  /** Remember a corrected receipt name for the household. */
  rememberAlias: (alias: string, name: string) => Promise<unknown>;
  canUse?: CanUse;
}

/**
 * Write reviewed receipt lines into the pantry (spec #26).
 * Skipped lines are ignored. A name the user changed from the suggestion is saved
 * as a household alias so the next receipt matches it.
 */
export async function applyReviewedReceipt(
  lines: readonly ReviewLine[],
  deps: ApplyReceiptDeps,
): Promise<ApplyReceiptResult> {
  const allowed = deps.canUse ?? defaultCanUse;
  if (!allowed('receiptScan') || !allowed('pantry')) {
    return { applied: 0, createdAliases: 0, locked: true };
  }
  let applied = 0;
  let createdAliases = 0;
  for (const line of lines) {
    if (line.skipped) continue;
    const name = line.name.trim();
    if (!name || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    await deps.addQuantity({
      name,
      quantity: line.quantity,
      ...(line.unit ? { unit: line.unit } : {}),
    });
    applied += 1;
    const suggested = ingredientKey({ text: line.suggestedName });
    const chosen = ingredientKey({ text: name });
    if (line.parsedName.trim() && chosen && chosen !== suggested) {
      await deps.rememberAlias(line.parsedName, name);
      createdAliases += 1;
    }
  }
  return { applied, createdAliases };
}
