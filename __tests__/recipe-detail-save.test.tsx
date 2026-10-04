/**
 * v1.0.6: the recipe detail saves rating / category / tag / cooked edits immediately and reliably, shows a
 * Save button + “Saved” status, asks before leaving with an unsaved tag, and keeps its buttons above the
 * Android navigation bar.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, StyleSheet, Text } from 'react-native';

import { createRecipe } from '@/lib/recipe-utils';
import { createCollection, withKeyLock, type KeyValueStore } from '@/storage/kv';
import { recipeStore } from '@/storage/recipes';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const React = require('react');
  const insets = { top: 24, left: 0, right: 0, bottom: 48 };
  const frame = { x: 0, y: 0, width: 411, height: 800 };
  const SafeAreaProvider = ({ children }: { children: unknown }) =>
    React.createElement(
      actual.SafeAreaInsetsContext.Provider,
      { value: insets },
      React.createElement(actual.SafeAreaFrameContext.Provider, { value: frame }, children),
    );
  return { ...actual, SafeAreaProvider, initialWindowMetrics: { insets, frame } };
});

const RecipeRoute = require('@/app/recipe/[id]/index').default;
const Home = () => <Text testID="home">Home</Text>;

async function seed() {
  const r = createRecipe({
    title: 'Pancakes',
    ingredients: [{ text: '1 egg' }],
    steps: [{ text: 'Mix' }],
    tags: [],
    servings: 2,
  });
  await recipeStore.save(r);
  const breakfast = await recipeStore.addCategory('Breakfast');
  return { r, breakfast };
}

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recipe detail saving', () => {
  it('keeps every edit when rating, category, tag and cooked are changed in quick succession', async () => {
    const { r, breakfast } = await seed();
    renderRouter({ 'recipe/[id]': RecipeRoute }, { initialUrl: `/recipe/${r.id}` });
    await screen.findByTestId('detail-rating-4');
    await screen.findByTestId(`assign-category-${breakfast.id}`);
    fireEvent.changeText(screen.getByTestId('add-tag-input'), 'Weekend');
    // Fire all four without waiting for each save — the old code built each save on a stale copy.
    await act(async () => {
      fireEvent.press(screen.getByTestId('detail-rating-4'));
      fireEvent.press(screen.getByTestId(`assign-category-${breakfast.id}`));
      fireEvent.press(screen.getByTestId('add-tag-button'));
      fireEvent.press(screen.getByTestId('cooked-toggle'));
    });
    await waitFor(async () => {
      const saved = await recipeStore.get(r.id);
      expect(saved?.rating).toBe(4);
      expect(saved?.categoryIds).toEqual([breakfast.id]);
      expect(saved?.tags).toEqual(['weekend']);
      expect(saved?.cooked).toBe(true);
    });
    expect(await screen.findByText('✓ Saved')).toBeTruthy();
  });

  it('shows a Save button for a typed tag and saves it with a confirmation', async () => {
    const { r } = await seed();
    renderRouter({ 'recipe/[id]': RecipeRoute }, { initialUrl: `/recipe/${r.id}` });
    const save = await screen.findByTestId('recipe-save-button');
    expect(save).toHaveTextContent('Saved');
    expect(save).toBeDisabled();
    expect(screen.getByTestId('recipe-save-status')).toHaveTextContent('All changes saved');

    fireEvent.changeText(screen.getByTestId('add-tag-input'), 'Quick');
    expect(screen.getByTestId('recipe-save-button')).toHaveTextContent('Save');
    expect(screen.getByTestId('recipe-save-button')).toBeEnabled();
    expect(screen.getByTestId('recipe-save-status')).toHaveTextContent('Unsaved tag “Quick”');

    await act(async () => fireEvent.press(screen.getByTestId('recipe-save-button')));
    expect((await recipeStore.get(r.id))?.tags).toEqual(['quick']);
    expect(screen.getByTestId('recipe-save-status')).toHaveTextContent('✓ Saved');
    expect(screen.getByTestId('add-tag-input').props.value).toBe('');
    expect(screen.getByTestId('recipe-save-button')).toBeDisabled();
  });

  it('asks before leaving with an unsaved tag, and Save keeps it', async () => {
    const { r } = await seed();
    const alert = jest.spyOn(Alert, 'alert');
    renderRouter({ index: Home, 'recipe/[id]': RecipeRoute }, { initialUrl: '/' });
    const { router } = require('expo-router');
    await act(async () => router.push(`/recipe/${r.id}`));
    fireEvent.changeText(await screen.findByTestId('add-tag-input'), 'Brunch');
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledWith('Save changes?', expect.any(String), expect.any(Array));
    expect(screen.getByTestId('add-tag-input')).toBeTruthy(); // still on the recipe
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Save')!.onPress!());
    await waitFor(async () => expect((await recipeStore.get(r.id))?.tags).toEqual(['brunch']));
    expect(await screen.findByTestId('home')).toBeTruthy();
  });

  it('Discard leaves without saving; no prompt when everything is saved', async () => {
    const { r } = await seed();
    const alert = jest.spyOn(Alert, 'alert');
    renderRouter({ index: Home, 'recipe/[id]': RecipeRoute }, { initialUrl: '/' });
    const { router } = require('expo-router');
    await act(async () => router.push(`/recipe/${r.id}`));
    fireEvent.changeText(await screen.findByTestId('add-tag-input'), 'Nope');
    await act(async () => router.back());
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
    expect(await screen.findByTestId('home')).toBeTruthy();
    expect((await recipeStore.get(r.id))?.tags).toEqual([]);

    alert.mockClear();
    await act(async () => router.push(`/recipe/${r.id}`));
    await act(async () => fireEvent.press(await screen.findByTestId('detail-rating-5')));
    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    expect(await screen.findByTestId('home')).toBeTruthy();
    expect((await recipeStore.get(r.id))?.rating).toBe(5);
  });

  it('keeps the action buttons and save bar above the Android navigation bar', async () => {
    const { r } = await seed();
    renderRouter({ 'recipe/[id]': RecipeRoute }, { initialUrl: `/recipe/${r.id}` });
    const root = await screen.findByTestId('recipe-detail-screen');
    // The whole screen (scroll viewport + save bar) ends above the 48dp system bar, not just the content.
    expect(StyleSheet.flatten(root.props.style).paddingBottom).toBe(48);
    expect(screen.getByTestId('recipe-save-bar')).toBeTruthy();
    expect(screen.getByTestId('cooked-toggle')).toBeTruthy();
  });
});

describe('collection write queue', () => {
  function memoryStore(): KeyValueStore {
    const data = new Map<string, string>();
    // Yield a few microtasks so unqueued read-modify-writes would interleave.
    const wait = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    return {
      async getItem(k) {
        await wait();
        return data.get(k) ?? null;
      },
      async setItem(k, v) {
        await wait();
        data.set(k, v);
      },
      async removeItem(k) {
        data.delete(k);
      },
    };
  }

  it('concurrent saves never drop each other', async () => {
    const col = createCollection<{ id: string; n: number }>(
      memoryStore(),
      'items',
      (v) => v as { id: string; n: number },
    );
    await Promise.all([1, 2, 3, 4, 5].map((n) => col.save({ id: `i${n}`, n })));
    expect((await col.all()).map((x) => x.id).sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
  });

  it('withKeyLock runs tasks in order and keeps going after a failure', async () => {
    const store = memoryStore();
    const order: number[] = [];
    const a = withKeyLock(store, 'k', async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
      order.push(1);
      throw new Error('boom');
    });
    const b = withKeyLock(store, 'k', async () => {
      order.push(2);
      return 'ok';
    });
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('ok');
    expect(order).toEqual([1, 2]);
  });
});
