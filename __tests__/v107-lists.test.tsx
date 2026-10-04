/**
 * v1.0.7: Shopping List quantity + notes (add, show, edit, persist, safe for existing data), pantry Notes,
 * no sweetener rule text, accent colors.
 */
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { featureGate, LocalFreeEntitlements } from '@/entitlements';
import { startOfWeek, toIsoDate } from '@/lib/dates';
import { addManualItem, compileWeekShoppingList, emptyShoppingList, updateItemDetails } from '@/lib/shopping';
import { ACCENTS, buildColors } from '@/lib/theme';
import { createMealPlanStore, mealPlanStore, SHOPPING_ITEMS_STORAGE_KEY } from '@/storage/meal-plan';
import { createPantryStore, pantryStore, PANTRY_STORAGE_KEY } from '@/storage/pantry';
import type { KeyValueStore } from '@/storage/kv';

let mockWidth = 411;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

function memoryStore(seed: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
}

const NOW = new Date('2026-10-04T12:00:00Z');
const WEEK = toIsoDate(startOfWeek(new Date()));

beforeEach(async () => {
  mockWidth = 411;
  await require('@react-native-async-storage/async-storage').clear();
  act(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });
});

describe('shopping quantity + notes (lib/storage)', () => {
  it('adds optional quantity and notes; blank ones are not stored', () => {
    const list = addManualItem(emptyShoppingList('2026-10-05'), 'paper towels', NOW, { quantity: ' 2 rolls ', notes: 'Any brand' });
    expect(list.items[0]).toMatchObject({ text: 'paper towels', quantity: '2 rolls', notes: 'Any brand' });
    const plain = addManualItem(emptyShoppingList('2026-10-05'), 'milk', NOW, { quantity: ' ', notes: '' });
    expect(plain.items[0]).not.toHaveProperty('quantity');
    expect(plain.items[0]).not.toHaveProperty('notes');
  });

  it('edits and clears them; rebuilding the week keeps them', () => {
    let list = addManualItem(emptyShoppingList('2026-10-05'), 'lemons', NOW);
    const id = list.items[0].id;
    list = updateItemDetails(list, id, { quantity: '3', notes: 'Organic' }, NOW);
    expect(list.items[0]).toMatchObject({ quantity: '3', notes: 'Organic' });
    list = updateItemDetails(list, id, { notes: '' }, NOW);
    expect(list.items[0].notes).toBeUndefined();
    expect(list.items[0].quantity).toBe('3');
    const rebuilt = compileWeekShoppingList('2026-10-05', [], [], list, undefined, NOW);
    expect(rebuilt.items[0]).toMatchObject({ id, quantity: '3' });
  });

  it('persists through the store (changes alone trigger a write)', async () => {
    const plan = createMealPlanStore(memoryStore());
    let list = addManualItem(emptyShoppingList('2026-10-05'), 'eggs', NOW);
    await plan.saveShoppingList(list, NOW);
    list = updateItemDetails(list, list.items[0].id, { quantity: '12', notes: 'Large' }, NOW);
    await plan.saveShoppingList(list, NOW);
    expect((await plan.getShoppingList('2026-10-05'))!.items[0]).toMatchObject({ quantity: '12', notes: 'Large' });
  });

  it('1.0.6 → 1.0.7: existing rows load unchanged (no quantity/notes, nothing lost); bad values are dropped', async () => {
    const ts = '2026-10-01T00:00:00.000Z';
    const kv = memoryStore({
      [SHOPPING_ITEMS_STORAGE_KEY]: [
        { id: 'a', weekStart: '2026-10-05', text: '2 cups almond flour', name: 'almond flour', checked: true, recipeIds: ['r1'], aisle: 'Baking', createdAt: ts, updatedAt: ts },
        { id: 'b', weekStart: '2026-10-05', text: 'milk', checked: false, recipeIds: [], quantity: 5, notes: '  ', createdAt: ts, updatedAt: ts },
      ],
    });
    const plan = createMealPlanStore(kv);
    const items = (await plan.getShoppingList('2026-10-05'))!.items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 'a', weekStart: '2026-10-05', text: '2 cups almond flour', name: 'almond flour', checked: true, recipeIds: ['r1'], aisle: 'Baking', createdAt: ts, updatedAt: ts });
    expect(items[1]).not.toHaveProperty('quantity');
    expect(items[1]).not.toHaveProperty('notes');
  });
});

describe('shopping quantity + notes (screen)', () => {
  const Shopping = () => require('@/app/(tabs)/shopping').default;

  it('the add box offers optional Quantity and Notes (plain labels, no example text); both show and are editable', async () => {
    renderRouter({ index: Shopping() }, { initialUrl: '/' });
    const qty = await screen.findByTestId('manual-quantity');
    const notes = screen.getByTestId('manual-notes');
    expect(qty.props.placeholder).toBe('Quantity (optional)');
    expect(notes.props.placeholder).toBe('Notes (optional)');
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Generic is fine|e\.g\./);
    fireEvent.changeText(screen.getByTestId('manual-input'), 'Paper towels');
    fireEvent.changeText(qty, '2');
    fireEvent.changeText(notes, 'Big pack');
    await act(async () => fireEvent.press(screen.getByTestId('add-manual')));
    const [item] = (await mealPlanStore.getShoppingList(WEEK))!.items;
    expect(item).toMatchObject({ text: 'Paper towels', quantity: '2', notes: 'Big pack' });
    expect(await screen.findByTestId(`shop-item-qty-${item.id}`)).toHaveTextContent('Qty: 2');
    expect(screen.getByTestId(`shop-item-notes-${item.id}`)).toHaveTextContent('Big pack');
    expect(screen.getByTestId('manual-quantity').props.value).toBe('');

    await act(async () => fireEvent.press(screen.getByTestId(`shop-item-edit-${item.id}`)));
    const box = screen.getByTestId(`shop-edit-${item.id}`);
    expect(within(box).getByTestId('shop-edit-quantity').props.value).toBe('2');
    fireEvent.changeText(within(box).getByTestId('shop-edit-quantity'), '3 packs');
    fireEvent.changeText(within(box).getByTestId('shop-edit-notes'), '');
    await act(async () => fireEvent.press(within(box).getByTestId('shop-edit-save')));
    expect(await screen.findByTestId(`shop-item-qty-${item.id}`)).toHaveTextContent('Qty: 3 packs');
    expect(screen.queryByTestId(`shop-item-notes-${item.id}`)).toBeNull();
    const [saved] = (await mealPlanStore.getShoppingList(WEEK))!.items;
    expect(saved.quantity).toBe('3 packs');
    expect(saved.notes).toBeUndefined();
  });
});

describe('pantry Notes (v1.0.7)', () => {
  it('store: optional notes saved, edited, cleared; older items without notes load as before', async () => {
    const ts = '2026-10-01T00:00:00.000Z';
    const pantry = createPantryStore(memoryStore({ [PANTRY_STORAGE_KEY]: [{ id: 'p1', name: 'allulose', quantity: 1, unit: 'cup', createdAt: ts, updatedAt: ts }] }));
    expect((await pantry.list())[0]).toEqual({ id: 'p1', name: 'allulose', quantity: 1, unit: 'cup', createdAt: ts, updatedAt: ts });
    const saved = await pantry.saveDetails({ id: 'p1', name: 'allulose', quantity: 1, unit: 'cup', notes: 'Second shelf' }, NOW);
    expect(saved.notes).toBe('Second shelf');
    expect((await pantry.saveDetails({ id: 'p1', name: 'allulose', notes: '  ' }, NOW)).notes).toBeUndefined();
  });

  it('form: plain Notes field (no example text), shown on the item', async () => {
    const Pantry = require('@/app/(tabs)/pantry').default;
    renderRouter({ index: Pantry }, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('pantry-add-button'));
    const notes = screen.getByTestId('pantry-notes-input');
    expect(notes.props.placeholder).toBe('Notes (optional)');
    fireEvent.changeText(screen.getByTestId('pantry-name-input'), 'Rice');
    fireEvent.changeText(notes, 'Use the big bag first');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    expect(await screen.findByText('Use the big bag first')).toBeTruthy();
    const [rice] = await pantryStore.list();
    expect(rice.notes).toBe('Use the big bag first');
    fireEvent.press(screen.getByTestId(`pantry-item-${rice.id}`));
    expect(screen.getByTestId('pantry-notes-input').props.value).toBe('Use the big bag first');
    expect(screen.getByTestId('pantry-form-actions')).toBeTruthy();
  });
});

describe('no sweetener rule text in the UI (v1.0.7)', () => {
  it('Add Recipe, Import and the recipe editor no longer show it', async () => {
    for (const mod of ['@/app/add', '@/app/import']) {
      const Screen = require(mod).default;
      renderRouter({ index: Screen }, { initialUrl: '/' });
      await act(async () => {});
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/Sweetener rule|monk fruit/i);
      screen.unmount();
    }
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/components/recipe-editor.tsx'), 'utf8');
    expect(src).not.toMatch(/no monk fruit|Sweetener rule/);
  });
});

describe('accent colors (v1.0.7)', () => {
  const hsl = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, l };
  };
  const OLD = {
    green: { dark: '#66BB6A', light: '#2E7D32' },
    orange: { dark: '#FF9E5E', light: '#B54708' },
    purple: { dark: '#B47CFF', light: '#6A1B9A' },
  } as const;

  it.each(['green', 'orange', 'purple'] as const)('%s is darker/deeper in both modes', (id) => {
    for (const scheme of ['dark', 'light'] as const) {
      expect(hsl(buildColors(scheme, id).primary).l).toBeLessThan(hsl(OLD[id][scheme]).l);
    }
  });

  it('Lime is a truer, brighter lime green (less yellow)', () => {
    const dark = hsl(buildColors('dark', 'lime').primary);
    const light = hsl(buildColors('light', 'lime').primary);
    expect(dark.h).toBeGreaterThanOrEqual(80);
    expect(dark.h).toBeLessThanOrEqual(100);
    expect(light.h).toBeGreaterThanOrEqual(80);
    expect(light.l).toBeGreaterThan(hsl('#556300').l);
    expect(hsl('#C6D93F').h).toBeLessThan(70); // the old one leaned yellow
  });

  it('the other eight are unchanged', () => {
    const expected: Record<string, [string, string]> = {
      blue: ['#64B5F6', '#1565C0'],
      red: ['#FF4444', '#D32F2F'],
      teal: ['#26BFB0', '#00796B'],
      pink: ['#FF5CA8', '#AD1457'],
      amber: ['#FFCA28', '#8A5300'],
      indigo: ['#7C8CFF', '#3949AB'],
      brown: ['#CD8E62', '#6D4C41'],
      slate: ['#B0BEC5', '#455A64'],
    };
    for (const [id, [dark, light]] of Object.entries(expected)) {
      const a = ACCENTS.find((x) => x.id === id)!;
      expect([id, a.dark.primary, a.light.primary]).toEqual([id, dark, light]);
    }
  });
});
