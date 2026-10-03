/**
 * Spec #23 acceptance: every screen is verified at compact AND expanded widths.
 * Add a case here for each new screen (render at COMPACT and EXPANDED, assert the right panes).
 */
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { TwoPaneLayout } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';
import { SEED_RECIPES } from '@/data/seed';
import { getWindowSizeClass } from '@/hooks/use-window-size-class';

const COMPACT = 411; // folded / phone
const MEDIUM = 673; // unfolded book foldable, portrait
const EXPANDED = 900; // unfolded landscape / tablet

let mockWidth = COMPACT;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

beforeEach(async () => {
  mockWidth = COMPACT;
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});

describe('window size classes', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1280, 'expanded'],
  ])('%sdp → %s', (w, cls) => expect(getWindowSizeClass(w)).toBe(cls));
});

describe('TwoPaneLayout', () => {
  it('is single-pane at compact and side-by-side at medium/expanded, without remounting the primary pane', async () => {
    let mounts = 0;
    function Primary() {
      useEffect(() => {
        mounts++;
      }, []);
      return <Text>LIST</Text>;
    }
    const ui = () => <TwoPaneLayout primary={<Primary />} secondary={null} placeholder={<Text>PICK ONE</Text>} />;

    await render(ui());
    expect(screen.getByTestId('two-pane-layout-single')).toBeTruthy();
    expect(screen.queryByText('PICK ONE')).toBeNull();

    // Unfold: same tree, now two panes.
    mockWidth = EXPANDED;
    await screen.rerender(ui());
    expect(screen.getByTestId('two-pane-layout-dual')).toBeTruthy();
    expect(screen.getByText('PICK ONE')).toBeTruthy();

    mockWidth = MEDIUM;
    await screen.rerender(ui());
    expect(screen.getByTestId('two-pane-layout-dual')).toBeTruthy();

    mockWidth = COMPACT;
    await screen.rerender(ui());
    expect(mounts).toBe(1); // state survives fold/unfold
  });
});

describe.each([
  ['compact', COMPACT],
  ['expanded', EXPANDED],
])('screens at %s width', (_label, width) => {
  beforeEach(() => {
    mockWidth = width;
  });

  it('RecipeDetail renders a recipe', async () => {
    const { recipeStore } = require('@/storage/recipes');
    await recipeStore.seedIfNeeded();
    await render(<RecipeDetail id={SEED_RECIPES[0].id} />);
    expect(await screen.findByText(SEED_RECIPES[0].title)).toBeTruthy();
    expect(screen.getByText('Ingredients')).toBeTruthy();
  });

  it('Recipes tab: list-detail in expanded, navigation in compact', async () => {
    const RecipesTab = require('@/app/(tabs)/index').default;
    const RecipeRoute = require('@/app/recipe/[id]').default;
    renderRouter({ index: RecipesTab, 'recipe/[id]': RecipeRoute }, { initialUrl: '/' });
    const item = await screen.findByTestId(`recipe-item-${SEED_RECIPES[1].id}`);
    if (width >= 600) {
      expect(screen.getByTestId('recipes-layout-dual')).toBeTruthy();
      expect(screen.getByText('Select a recipe to see it here.')).toBeTruthy();
      await act(async () => fireEvent.press(item));
      expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
      expect(screen).toHavePathname('/');
    } else {
      expect(screen.getByTestId('recipes-layout-single')).toBeTruthy();
      await act(async () => fireEvent.press(item));
      expect(screen).toHavePathname(`/recipe/${SEED_RECIPES[1].id}`);
    }
  });

  it.each([
    ['(tabs)/meal-plan', 'Nothing planned'],
    ['(tabs)/shopping', 'No list yet for this week.'],
    ['add', 'Save recipe'],
  ])('%s renders (width-capped)', async (route, text) => {
    const Screen = require(`@/app/${route}`).default;
    renderRouter({ index: Screen }, { initialUrl: '/' });
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });
});
