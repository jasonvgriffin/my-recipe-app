/**
 * v1.0.9 regression checks: keyboard resize, focused-input lookup, and every TextInput screen uses keyboard avoidance.
 */
import { Platform, TextInput } from 'react-native';

import { focusedTextInput } from '@/components/layout';

type FocusState = {
  currentlyFocusedInput?: (() => unknown) | undefined;
  currentlyFocusedField?: (() => unknown) | undefined;
};

function focusState(): FocusState {
  const input = TextInput as { State?: FocusState };
  if (!input.State) input.State = {};
  return input.State;
}

const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };
const { join } = jest.requireActual('path') as { join: (...parts: string[]) => string };

describe('focusedTextInput', () => {
  const saved = { ...focusState() };
  const savedOs = Platform.OS;

  afterEach(() => {
    const state = focusState();
    state.currentlyFocusedInput = saved.currentlyFocusedInput;
    state.currentlyFocusedField = saved.currentlyFocusedField;
    Platform.OS = savedOs;
    // @ts-expect-error test double
    delete global.document;
  });

  it('does not call a missing currentlyFocusedInput (that throw is the web crash)', () => {
    const state = focusState();
    state.currentlyFocusedInput = undefined;
    const field = { id: 'field' };
    state.currentlyFocusedField = () => field;
    expect(focusedTextInput()).toBe(field);
  });

  it('uses document.activeElement on web when both State helpers are missing', () => {
    Platform.OS = 'web';
    const state = focusState();
    state.currentlyFocusedInput = undefined;
    state.currentlyFocusedField = undefined;
    const el = { tagName: 'INPUT', id: 'active' };
    const body = { tagName: 'BODY' };
    // @ts-expect-error test double
    global.document = { activeElement: el, body };
    expect(focusedTextInput()).toBe(el);
  });
});

describe('v1.0.9 keyboard', () => {
  it('Android resizes the window when the software keyboard opens', () => {
    const app = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: { android: { softwareKeyboardLayoutMode?: string; versionCode?: number }; version?: string };
    };
    expect(app.expo.version).toBe('1.0.9');
    expect(app.expo.android.versionCode).toBe(10);
    expect(app.expo.android.softwareKeyboardLayoutMode).toBe('resize');
  });

  it('every screen with a TextInput scrolls the focused field or avoids the keyboard', () => {
    const files = [
      'src/components/recipe-list.tsx',
      'src/components/shopping-list-view.tsx',
      'src/app/(tabs)/pantry.tsx',
      'src/app/add.tsx',
      'src/components/recipe-editor.tsx',
      'src/app/import.tsx',
      'src/components/day-plan.tsx',
      'src/components/recipe-detail.tsx',
      'src/components/barcode-scanner.tsx',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src).toMatch(/KeyboardAwareScrollView|KeyboardAwareFlatList|KeyboardAvoidingView/);
    }
    // Category and tag fields live inside those scrolling parents.
    expect(readFileSync(join(process.cwd(), 'src/components/recipe-categories.tsx'), 'utf8')).toMatch(/onFieldFocus/);
    expect(readFileSync(join(process.cwd(), 'src/components/tag-editor.tsx'), 'utf8')).toMatch(/TextInput/);
  });
});
