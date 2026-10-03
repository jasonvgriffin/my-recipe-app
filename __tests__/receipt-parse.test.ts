import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import { applyReviewedReceipt, buildReceiptReview, parseReceipt } from '@/receipts';
import type { PantryItem } from '@/types/recipe';

import { GROCERY_RECEIPT as fixture } from './fixtures/receipt-grocery';

const item = (name: string, id = name): PantryItem => ({
  id,
  name,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
});

afterEach(() => {
  featureGate.resetConfig();
  featureGate.setProvider(new LocalFreeEntitlements());
});

describe('parseReceipt (spec #26)', () => {
  it('reads a grocery fixture and skips totals, tax, payment, and the store header', () => {
    const lines = parseReceipt(fixture);
    expect(lines.map((line) => line.name)).toEqual([
      'gv bnls chkn',
      'almond flour',
      'eggs',
      'bananas',
      'allulose',
      'org heavy cream',
      'total cereal',
      'yogurt',
    ]);
    expect(lines.find((line) => line.name === 'eggs')).toMatchObject({ quantity: 2, price: 5 });
    expect(lines.find((line) => line.name === 'bananas')).toMatchObject({ quantity: 1.25, unit: 'lb', price: 0.73 });
    expect(lines.find((line) => line.name === 'allulose')).toMatchObject({ quantity: 1, unit: 'lb', price: 9.99 });
    expect(lines.find((line) => line.name === 'yogurt')).toMatchObject({ quantity: 3, price: 2.49 });
    expect(lines.find((line) => line.name === 'gv bnls chkn')).toMatchObject({ quantity: 1, price: 8.97 });
    expect(lines.some((line) => /walmart|main street|subtotal|visa|thank/i.test(line.name))).toBe(false);
  });

  it('applies a following "2 @ price" line as the quantity of the previous item', () => {
    const lines = parseReceipt('GV BNLS CHKN 8.97\n2 @ 4.48 8.96\nTOTAL 8.96');
    expect(lines).toEqual([
      expect.objectContaining({ name: 'gv bnls chkn', quantity: 2, price: 8.96 }),
    ]);
  });
});

describe('receipt review, aliases, and apply', () => {
  it('learns a correction from GV BNLS CHKN to chicken breast and matches it next time', async () => {
    const text = 'GV BNLS CHKN 8.97\nALMOND FLOUR 6.48';
    const pantry = [item('chicken breast'), item('almond flour')];
    const first = buildReceiptReview(text, pantry, []);
    const chicken = first.find((line) => line.parsedName === 'gv bnls chkn')!;
    expect(chicken.match).not.toBe('alias');
    expect(chicken.suggestedName).not.toBe('chicken breast');

    const edited = first.map((line) =>
      line.id === chicken.id ? { ...line, name: 'chicken breast', pantryItemId: 'chicken breast' } : line,
    );
    const aliases: { alias: string; name: string }[] = [];
    const added: { name: string; quantity: number; unit?: string }[] = [];
    const result = await applyReviewedReceipt(edited, {
      addQuantity: async (input) => {
        added.push(input);
      },
      rememberAlias: async (alias, name) => {
        aliases.push({ alias, name });
      },
    });
    expect(result.applied).toBe(2);
    expect(result.createdAliases).toBe(1);
    expect(result.locked).toBeUndefined();
    expect(aliases).toEqual([{ alias: 'gv bnls chkn', name: 'chicken breast' }]);
    expect(added).toEqual([
      { name: 'chicken breast', quantity: 1 },
      { name: 'almond flour', quantity: 1 },
    ]);

    const second = buildReceiptReview(text, pantry, aliases);
    expect(second.find((line) => line.parsedName === 'gv bnls chkn')).toMatchObject({
      match: 'alias',
      name: 'chicken breast',
      pantryItemId: 'chicken breast',
    });
  });

  it('does not write an alias when the suggestion is accepted unchanged, and skips skipped lines', async () => {
    const lines = buildReceiptReview('ALMOND FLOUR 6.48\n2 EGGS 5.00', [item('almond flour')], []).map((line) =>
      line.parsedName === 'eggs' ? { ...line, skipped: true } : line,
    );
    const rememberAlias = jest.fn();
    const addQuantity = jest.fn(async () => undefined);
    const result = await applyReviewedReceipt(lines, { addQuantity, rememberAlias });
    expect(result).toEqual({ applied: 1, createdAliases: 0 });
    expect(rememberAlias).not.toHaveBeenCalled();
    expect(addQuantity).toHaveBeenCalledTimes(1);
  });

  it('does nothing when receipt scanning is gated off', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ receiptScan: { tier: 'premium', enabled: true } });
    const addQuantity = jest.fn();
    const result = await applyReviewedReceipt(
      buildReceiptReview('ALMOND FLOUR 4.00', [], []),
      { addQuantity, rememberAlias: jest.fn() },
    );
    expect(result.locked).toBe(true);
    expect(result.applied).toBe(0);
    expect(addQuantity).not.toHaveBeenCalled();
  });
});
