import { extractRecipeHeuristically } from '@/import/parsers/heuristics';

const MICRODATA = `<div itemscope itemtype="http://schema.org/Recipe">
  <h1 itemprop="name">Allulose Lemon Bars</h1>
  <meta itemprop="description" content="Bright and simple." />
  <span itemprop="recipeYield">9</span>
  <li itemprop="recipeIngredient">1 cup almond flour</li>
  <li itemprop="recipeIngredient">1/2 cup allulose</li>
  <ol itemprop="recipeInstructions">
    <li itemprop="text">Mix.</li>
    <li itemprop="text">Bake 20 minutes.</li>
  </ol>
</div>`;

const WPRM = `<div class="wprm-recipe-container">
  <h2 class="wprm-recipe-name">Sheet-pan chicken</h2>
  <div class="wprm-recipe-summary">Crispy thighs.</div>
  <span class="wprm-recipe-servings">4</span>
  <li class="wprm-recipe-ingredient">
    <span class="wprm-recipe-ingredient-amount">6</span>
    <span class="wprm-recipe-ingredient-unit"></span>
    <span class="wprm-recipe-ingredient-name">chicken thighs</span>
  </li>
  <div class="wprm-recipe-instruction-text">Roast 35 minutes.</div>
  <img class="wprm-recipe-image" src="https://cdn.example.com/chicken.jpg" />
</div>`;

const TASTY = `<div class="tasty-recipes">
  <h2 class="tasty-recipes-title">Cauliflower mash</h2>
  <div class="tasty-recipes-ingredients"><ul><li>1 head cauliflower</li><li>2 tbsp butter</li></ul></div>
  <div class="tasty-recipes-instructions"><ol><li>Steam.</li><li>Mash.</li></ol></div>
  <span class="tasty-recipes-yield">servings: 4</span>
</div>`;

const HEADINGS = `<html><head><title>Ignored title</title></head><body>
  <h1>Skillet eggs</h1>
  <h2>Ingredients</h2>
  <ul><li>4 eggs</li><li>1 tbsp butter</li></ul>
  <h2>Instructions</h2>
  <ol><li>Melt butter.</li><li>Cook 4 minutes.</li></ol>
  <h2>Notes</h2>
  <ul><li>Do not import this note as a step.</li></ul>
</body></html>`;

describe('extractRecipeHeuristically (spec #1 fallback)', () => {
  it('reads schema.org microdata', () => {
    expect(extractRecipeHeuristically(MICRODATA, 'https://example.com/bars')).toMatchObject({
      title: 'Allulose Lemon Bars',
      description: 'Bright and simple.',
      servings: 9,
      ingredients: ['1 cup almond flour', '1/2 cup allulose'],
      steps: ['Mix.', 'Bake 20 minutes.'],
      sourceUrl: 'https://example.com/bars',
    });
  });

  it('reads WP Recipe Maker markup', () => {
    expect(extractRecipeHeuristically(WPRM)).toMatchObject({
      title: 'Sheet-pan chicken',
      description: 'Crispy thighs.',
      servings: 4,
      ingredients: ['6 chicken thighs'],
      steps: ['Roast 35 minutes.'],
      photoUrl: 'https://cdn.example.com/chicken.jpg',
    });
  });

  it('reads Tasty Recipes markup', () => {
    expect(extractRecipeHeuristically(TASTY)).toMatchObject({
      title: 'Cauliflower mash',
      servings: 4,
      ingredients: ['1 head cauliflower', '2 tbsp butter'],
      steps: ['Steam.', 'Mash.'],
    });
  });

  it('reads a heading plus lists when no plugin markup exists', () => {
    expect(extractRecipeHeuristically(HEADINGS)).toMatchObject({
      title: 'Skillet eggs',
      ingredients: ['4 eggs', '1 tbsp butter'],
      steps: ['Melt butter.', 'Cook 4 minutes.'],
    });
  });

  it('returns undefined when the page has no recipe', () => {
    expect(extractRecipeHeuristically('<html><h1>About</h1><p>Hello</p></html>')).toBeUndefined();
    expect(extractRecipeHeuristically('')).toBeUndefined();
  });

  it('prefers microdata over a generic heading on the same page', () => {
    const html = `${MICRODATA}<h1>Something else</h1><h2>Ingredients</h2><ul><li>nope</li></ul><h2>Steps</h2><ul><li>nope</li></ul>`;
    expect(extractRecipeHeuristically(html)?.title).toBe('Allulose Lemon Bars');
  });
});
