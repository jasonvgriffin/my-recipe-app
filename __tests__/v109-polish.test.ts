/**
 * v1.0.9 regression checks: keyboard resize, and every TextInput screen uses keyboard avoidance.
 */
const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };
const { join } = jest.requireActual('path') as { join: (...parts: string[]) => string };

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
