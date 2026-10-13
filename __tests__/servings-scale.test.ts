/**
 * Servings scaling (v1.1.0). Quantities that parse as a number, fraction, or mixed number scale.
 * A line that does not parse stays as written.
 */
import { formatIngredient, parseIngredient, presentIngredient, scaleIngredient } from '@/lib/ingredients';

describe('servings scaling', () => {
  it('scales fractions and mixed numbers', () => {
    expect(formatIngredient(scaleIngredient(parseIngredient('1/2 cup flour'), 2))).toBe('1 cup flour');
    expect(formatIngredient(scaleIngredient(parseIngredient('1½ tsp salt'), 2))).toBe('3 tsp salt');
    expect(formatIngredient(scaleIngredient(parseIngredient('2 1/2 tbsp oil'), 2))).toBe('5 tbsp oil');
    expect(presentIngredient(parseIngredient('1/3 cup milk'), { factor: 2 })).toBe('⅔ cup milk');
    expect(presentIngredient(parseIngredient('2-3 cloves garlic'), { factor: 2 })).toBe('4–6 cloves garlic');
  });

  it('leaves a quantity it cannot parse as written', () => {
    for (const line of ['a pinch of salt', 'Salt and pepper to taste', 'some fresh herbs']) {
      const ing = parseIngredient(line);
      expect(ing.quantity).toBeUndefined();
      expect(scaleIngredient(ing, 3)).toEqual(ing);
      expect(presentIngredient(ing, { factor: 4 })).toBe(line);
    }
  });

  it('does not change a line when the factor is 1', () => {
    const ing = parseIngredient('2 1/2 cups broth');
    expect(presentIngredient(ing, { factor: 1 })).toBe(formatIngredient(ing));
  });
});
