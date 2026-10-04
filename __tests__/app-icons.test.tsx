/**
 * App icon picker (v1.0.6): launcher activity-aliases from the config plugin, the icon assets, and the
 * Settings → Appearance picker (warns, switches, persists).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';

const mockNative = { getAppIcon: jest.fn(), setAppIcon: jest.fn() };
jest.mock('recipe-share', () => ({
  shareAsync: jest.fn(),
  getAppIcon: (...a: unknown[]) => mockNative.getAppIcon(...a),
  setAppIcon: (...a: unknown[]) => mockNative.setAppIcon(...a),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../plugins/with-alternate-icons');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICONS: { id: string; label: string; background: string; design?: string }[] = require('../assets/app-icons/icons.json');
const PKG = 'com.jasonvgriffin.myrecipeapp';
const fs = jest.requireActual('fs');
const os = jest.requireActual('os');
const path = jest.requireActual('path');
const ROOT: string = path.resolve('.');

/** The MainActivity Expo prebuild generates: launcher + deep-link (scheme, incl. the auth redirect) filters. */
function prebuildManifest() {
  return {
    manifest: {
      $: {},
      application: [
        {
          $: { 'android:icon': '@mipmap/ic_launcher', 'android:roundIcon': '@mipmap/ic_launcher_round' },
          activity: [
            {
              $: { 'android:name': '.MainActivity', 'android:exported': 'true', 'android:launchMode': 'singleTask' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
                {
                  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                  category: [
                    { $: { 'android:name': 'android.intent.category.DEFAULT' } },
                    { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
                  ],
                  data: [{ $: { 'android:scheme': 'myrecipeapp' } }, { $: { 'android:scheme': PKG } }],
                },
                {
                  action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
                  data: [{ $: { 'android:mimeType': 'text/plain' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

const launcherFilters = (node: { 'intent-filter'?: { category?: { $: Record<string, string> }[] }[] }) =>
  (node['intent-filter'] ?? []).filter((f) => (f.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER'));

describe('with-alternate-icons config plugin', () => {
  it('moves the launcher entry to one alias per icon; only the default is enabled; deep links stay on MainActivity', () => {
    const out = plugin.applyAlternateIcons(prebuildManifest(), PKG);
    const app = out.manifest.application[0];
    const main = app.activity[0];
    expect(launcherFilters(main)).toHaveLength(0);
    // Deep links (myrecipeapp:// incl. the myrecipeapp://auth sign-in redirect) and share targets untouched.
    expect(main['intent-filter'].map((f: { action: { $: Record<string, string> }[] }) => f.action[0].$['android:name'])).toEqual([
      'android.intent.action.VIEW',
      'android.intent.action.SEND',
    ]);
    const aliases = app['activity-alias'];
    expect(aliases.map((a: { $: Record<string, string> }) => a.$['android:name'])).toEqual(
      ICONS.map((i) => `${PKG}.${plugin.aliasSuffix(i.id)}`),
    );
    for (const a of aliases) {
      expect(a.$['android:targetActivity']).toBe(`${PKG}.MainActivity`);
      expect(launcherFilters(a)).toHaveLength(1);
    }
    // Exactly one launcher entry on a fresh install: the default alias, with the app's own default icon.
    const enabled = aliases.filter((a: { $: Record<string, string> }) => a.$['android:enabled'] === 'true');
    expect(enabled).toHaveLength(1);
    expect(enabled[0].$).toMatchObject({
      'android:name': `${PKG}.LauncherIconDefault`,
      'android:icon': '@mipmap/ic_launcher',
      'android:roundIcon': '@mipmap/ic_launcher_round',
    });
    expect(aliases[1].$['android:icon']).toBe('@mipmap/ic_launcher_alt_orange');
    // Idempotent (prebuild may run the mod twice).
    const again = plugin.applyAlternateIcons(out, PKG);
    expect(again.manifest.application[0]['activity-alias']).toHaveLength(ICONS.length);
  });

  it('writes adaptive + legacy resources for every alternate icon', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
    plugin.writeIconResources(ROOT, dir);
    for (const icon of ICONS.filter((i) => i.id !== 'default')) {
      const xml = fs.readFileSync(path.join(dir, `mipmap-anydpi-v26/ic_launcher_alt_${icon.id}.xml`), 'utf8');
      expect(xml).toContain(`@drawable/ic_launcher_alt_${icon.id}_foreground`);
      // v1.0.7: each design has its own themed-icon (monochrome) layer.
      expect(xml).toContain(`@drawable/ic_launcher_alt_${icon.id}_monochrome`);
      expect(fs.existsSync(path.join(dir, `drawable-xxxhdpi/ic_launcher_alt_${icon.id}_monochrome.png`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `mipmap-xxxhdpi/ic_launcher_alt_${icon.id}_round.png`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `mipmap-anydpi-v26/ic_launcher_alt_${icon.id}_round.xml`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `drawable-xxxhdpi/ic_launcher_alt_${icon.id}_foreground.png`))).toBe(true);
      expect(fs.existsSync(path.join(dir, `mipmap-xxxhdpi/ic_launcher_alt_${icon.id}.png`))).toBe(true);
    }
    const colors = fs.readFileSync(path.join(dir, 'values/ic_launcher_alt_colors.xml'), 'utf8');
    expect(colors).toContain('<color name="ic_launcher_alt_orange_background">#E8590C</color>');
    expect(fs.existsSync(path.join(dir, 'mipmap-anydpi-v26/ic_launcher_alt_default.xml'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is registered in app.json, and the default stays the yellow bowl on dark green', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const app = require('../app.json');
    expect(app.expo.plugins).toContain('./plugins/with-alternate-icons');
    expect(app.expo.android.adaptiveIcon.backgroundColor).toBe('#16211A');
    expect(ICONS[0]).toMatchObject({ id: 'default', background: '#16211A', bowl: '#FFD60A' });
    expect(ICONS.length).toBeGreaterThanOrEqual(6);
    for (const icon of ICONS) expect(fs.existsSync(path.join(ROOT, 'assets/app-icons', icon.id, 'preview.png'))).toBe(true);
  });

  it('v1.0.7: real designs — Classic stays default, two crossed spoons included, earlier alias ids kept, every resource present', () => {
    expect(ICONS[0]).toMatchObject({ id: 'default', label: 'Classic' });
    const labels = ICONS.map((i) => i.label);
    expect(labels).toEqual(['Classic', 'Spoons', "Chef's Hat", 'Cookbook', 'Pot', 'Whisk', 'Fork & Knife']);
    expect(new Set(labels).size).toBe(labels.length);
    // Distinct designs, not color variants of one bowl.
    const designs = ICONS.map((i) => i.design);
    expect(new Set(designs).size).toBe(ICONS.length);
    expect(designs).toContain('spoons');
    // v1.0.6 alias ids are kept, so a phone using one of them keeps a launcher entry after the update.
    for (const id of ['default', 'orange', 'navy', 'cream', 'red', 'green']) expect(ICONS.map((i) => i.id)).toContain(id);
    const PNG_SIZES = { 'foreground.png': 432, 'monochrome.png': 432, 'legacy.png': 192, 'legacy_round.png': 192, 'preview.png': 160 };
    for (const icon of ICONS.filter((i) => i.id !== 'default')) {
      for (const [file, size] of Object.entries(PNG_SIZES)) {
        const buf = fs.readFileSync(path.join(ROOT, 'assets/app-icons', icon.id, file));
        // PNG IHDR: width/height at bytes 16..24.
        expect([icon.id, file, buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([icon.id, file, size, size]);
      }
    }
  });
});

describe('Settings → Appearance → App icon', () => {
  const { APP_ICONS, aliasSuffix } = jest.requireActual('@/lib/app-icons') as typeof import('@/lib/app-icons');

  beforeEach(async () => {
    await require('@react-native-async-storage/async-storage').clear();
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNative.getAppIcon.mockReturnValue('LauncherIconDefault');
    mockNative.setAppIcon.mockResolvedValue('LauncherIconNavy');
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists every icon in the same order as the plugin', () => {
    expect(APP_ICONS.map((i) => aliasSuffix(i.id))).toEqual(ICONS.map((i) => plugin.aliasSuffix(i.id)));
  });

  it('warns, switches the launcher alias and saves the choice', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons ?? []).find((b) => b.text === 'Change icon')?.onPress?.();
    });
    const Settings = require('@/app/settings').default;
    render(<Settings />);
    const picker = await screen.findByTestId('app-icon-picker');
    expect(picker).toBeTruthy();
    expect(screen.getByTestId('settings-app-icon-default').props.accessibilityState).toMatchObject({ selected: true });
    await act(async () => fireEvent.press(screen.getByTestId('settings-app-icon-navy')));
    expect(alert).toHaveBeenCalledWith("Use the Chef's Hat icon?", expect.stringMatching(/take a little while, or move the shortcut/), expect.any(Array));
    expect(mockNative.setAppIcon).toHaveBeenCalledWith('LauncherIconNavy', ICONS.map((i) => plugin.aliasSuffix(i.id)));
    expect(screen.getByTestId('settings-app-icon-navy').props.accessibilityState).toMatchObject({ selected: true });
    const { settingsStore } = require('@/storage/settings');
    expect((await settingsStore.get()).appearance.appIcon).toBe('navy');
  });

  it('is hidden where launcher icons cannot change (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const Settings = require('@/app/settings').default;
    render(<Settings />);
    expect(await screen.findByTestId('settings-screen')).toBeTruthy();
    expect(screen.queryByTestId('app-icon-picker')).toBeNull();
  });
});
