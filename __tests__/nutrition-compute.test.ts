import { presentIngredient, parseIngredient } from '@/lib/ingredients';
import {
  computeRecipeNutrition,
  nutritionFromFields,
  nutritionNameMatches,
  parseNutritionField,
} from '@/lib/nutrition';
import { effectiveUnitSystem } from '@/lib/units';
import type { Ingredient } from '@/types/recipe';

describe('nutrition fields (spec #17)', () => {
  it('treats a blank as unknown and zero as zero', () => {
    expect(parseNutritionField('')).toBeUndefined();
    expect(parseNutritionField('  ')).toBeUndefined();
    expect(parseNutritionField('0')).toBe(0);
    expect(parseNutritionField('4.5')).toBe(4.5);
    expect(parseNutritionField('-1')).toBe('invalid');
    expect(parseNutritionField('nope')).toBe('invalid');
  });

  it('omits blank nutrients instead of storing them as zero', () => {
    const parsed = nutritionFromFields({ calories: '180', carbsG: '', fiberG: '0', netCarbsG: '' }, 'manual');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.nutrition).toEqual({ calories: 180, fiberG: 0, source: 'manual' });
    expect(parsed.nutrition.carbsG).toBeUndefined();
    expect(parsed.nutrition.netCarbsG).toBeUndefined();
  });
});

describe('computed nutrition from per-100 g data (spec #17)', () => {
  const chicken: Ingredient = { text: '200 g chicken thighs', quantity: 200, unit: 'g', name: 'chicken thighs' };
  const oil: Ingredient = { text: '1 tbsp olive oil', quantity: 1, unit: 'tbsp', name: 'olive oil' };
  const density = {
    name: 'chicken thighs',
    per100g: { calories: 200, carbsG: 0, fiberG: 0, proteinG: 25, fatG: 12 },
  };

  it('matches a product phrase but not a short single word inside another food', () => {
    expect(nutritionNameMatches('chicken thighs', 'raw chicken thighs')).toBe(true);
    expect(nutritionNameMatches('allulose', 'powdered allulose')).toBe(true);
    expect(nutritionNameMatches('salt', 'sea salt')).toBe(false);
    expect(nutritionNameMatches('oil', 'olive oil')).toBe(false);
  });

  it('computes per serving and derives net carbs without inventing missing nutrients', () => {
    const full = computeRecipeNutrition([chicken], 2, [density]);
    expect(full.complete).toBe(true);
    expect(full.nutrition).toEqual({
      source: 'computed',
      calories: 200,
      carbsG: 0,
      fiberG: 0,
      netCarbsG: 0,
      proteinG: 25,
      fatG: 12,
    });

    const partial = computeRecipeNutrition([chicken, oil], 2, [density]);
    expect(partial.complete).toBe(false);
    expect(partial.missing).toEqual(['olive oil']);
    expect(partial.nutrition.calories).toBeUndefined();
    expect(partial.nutrition.carbsG).toBeUndefined();
    expect(partial.nutrition.netCarbsG).toBeUndefined();
  });

  it('uses the top of a range and refuses volume-only amounts', () => {
    const ranged: Ingredient = {
      text: '100-200 g chicken thighs',
      quantity: 100,
      quantityMax: 200,
      unit: 'g',
      name: 'chicken thighs',
    };
    expect(computeRecipeNutrition([ranged], 1, [density]).nutrition.calories).toBe(400);
    expect(computeRecipeNutrition([oil], 1, [{ name: 'olive oil', per100g: density.per100g }]).complete).toBe(false);
  });
});

describe('unit display and scaling (spec #16)', () => {
  it('follows the recipe override, then the app default', () => {
    expect(effectiveUnitSystem(undefined, { unitSystem: 'metric' })).toBe('metric');
    expect(effectiveUnitSystem({ unitSystem: 'original' }, { unitSystem: 'metric' })).toBe('original');
    expect(effectiveUnitSystem({ unitSystem: 'imperial' }, { unitSystem: 'metric' })).toBe('imperial');
  });

  it('scales first, then converts', () => {
    const beans = parseIngredient('1 lb green beans');
    expect(presentIngredient(beans, { factor: 0.5, unitSystem: 'metric' })).toBe('227 g green beans');
    expect(presentIngredient(parseIngredient('2 tbsp olive oil'), { factor: 0.5 })).toBe('1 tbsp olive oil');
  });
});
