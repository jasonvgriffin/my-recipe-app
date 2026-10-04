/**
 * Expo config plugin: alternate launcher icons (v1.0.6, Settings → Appearance → App icon).
 *
 * - MainActivity keeps every intent filter EXCEPT MAIN/LAUNCHER (deep links `myrecipeapp://…`, the auth redirect
 *   and share targets stay on the real activity, so they work whatever icon is picked).
 * - One <activity-alias> per icon (`<package>.LauncherIcon<Id>`, target MainActivity) carries MAIN/LAUNCHER.
 *   Only the default alias is enabled in the manifest, so a fresh install has exactly one launcher entry with the
 *   default icon (the app's own @mipmap/ic_launcher). The RecipeShare module's setAppIcon enables one alias and
 *   disables the others at runtime (PackageManager component state), never two at once.
 * - Icon resources for the alternates come from assets/app-icons/<id>/ (scripts/make-app-icons.py): an adaptive icon
 *   (foreground PNG + background color + monochrome layer) for API 26+, and legacy PNGs below that.
 * - v1.0.7: real designs (Spoons, Chef's Hat, Cookbook, Pot, Whisk, Fork & Knife) replace the color variants. Alias
 *   ids (orange, navy, cream, red, green) are kept on purpose: Android remembers which alias a user enabled, and
 *   removing that alias on update would leave the app with no launcher entry. New designs get new ids (teal).
 *   Each icon has its own monochrome (themed icon) layer when assets/app-icons/<id>/monochrome.png exists.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const ICONS = require('../assets/app-icons/icons.json');

const aliasSuffix = (id) => `LauncherIcon${id.charAt(0).toUpperCase()}${id.slice(1)}`;
const res = (id) => `ic_launcher_alt_${id}`;

function isLauncherFilter(filter) {
  const actions = (filter.action ?? []).map((a) => a.$['android:name']);
  const categories = (filter.category ?? []).map((c) => c.$['android:name']);
  return actions.includes('android.intent.action.MAIN') && categories.includes('android.intent.category.LAUNCHER');
}

/** Pure manifest transform (tested in __tests__/app-icons.test.ts). */
function applyAlternateIcons(manifest, packageName) {
  const app = manifest.manifest.application?.[0];
  if (!app) throw new Error('with-alternate-icons: <application> not found');
  const main = (app.activity ?? []).find((a) => /(^|\.)MainActivity$/.test(a.$['android:name']));
  if (!main) throw new Error('with-alternate-icons: MainActivity not found');
  main['intent-filter'] = (main['intent-filter'] ?? []).filter((f) => !isLauncherFilter(f));
  const target = main.$['android:name'].startsWith('.') ? `${packageName}${main.$['android:name']}` : main.$['android:name'];
  const keep = (app['activity-alias'] ?? []).filter((a) => !a.$['android:name'].includes('.LauncherIcon'));
  app['activity-alias'] = [
    ...keep,
    ...ICONS.map((icon) => ({
      $: {
        'android:name': `${packageName}.${aliasSuffix(icon.id)}`,
        'android:targetActivity': target,
        'android:enabled': icon.id === 'default' ? 'true' : 'false',
        'android:exported': 'true',
        'android:icon': icon.id === 'default' ? '@mipmap/ic_launcher' : `@mipmap/${res(icon.id)}`,
        'android:roundIcon': icon.id === 'default' ? '@mipmap/ic_launcher_round' : `@mipmap/${res(icon.id)}_round`,
        'android:label': '@string/app_name',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    })),
  ];
  return manifest;
}

function adaptiveXml(id, ownMonochrome) {
  const mono = ownMonochrome ? `@drawable/${res(id)}_monochrome` : '@mipmap/ic_launcher_monochrome';
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/${res(id)}_background"/>
    <foreground android:drawable="@drawable/${res(id)}_foreground"/>
    <monochrome android:drawable="${mono}"/>
</adaptive-icon>
`;
}

/** Writes the resource files for the alternate icons into android/app/src/main/res. */
function writeIconResources(projectRoot, resDir) {
  const write = (rel, data) => {
    const file = path.join(resDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  const colors = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>'];
  for (const icon of ICONS) {
    if (icon.id === 'default') continue;
    const src = path.join(projectRoot, 'assets/app-icons', icon.id);
    write(`drawable-xxxhdpi/${res(icon.id)}_foreground.png`, fs.readFileSync(path.join(src, 'foreground.png')));
    write(`mipmap-xxxhdpi/${res(icon.id)}.png`, fs.readFileSync(path.join(src, 'legacy.png')));
    write(`mipmap-xxxhdpi/${res(icon.id)}_round.png`, fs.readFileSync(path.join(src, 'legacy_round.png')));
    const monoFile = path.join(src, 'monochrome.png');
    const ownMono = fs.existsSync(monoFile);
    if (ownMono) write(`drawable-xxxhdpi/${res(icon.id)}_monochrome.png`, fs.readFileSync(monoFile));
    write(`mipmap-anydpi-v26/${res(icon.id)}.xml`, adaptiveXml(icon.id, ownMono));
    write(`mipmap-anydpi-v26/${res(icon.id)}_round.xml`, adaptiveXml(icon.id, ownMono));
    colors.push(`    <color name="${res(icon.id)}_background">${icon.background}</color>`);
  }
  colors.push('</resources>', '');
  write('values/ic_launcher_alt_colors.xml', colors.join('\n'));
}

module.exports = function withAlternateIcons(config) {
  const packageName = config.android?.package;
  if (!packageName) throw new Error('with-alternate-icons: android.package is required');
  config = withAndroidManifest(config, (c) => {
    c.modResults = applyAlternateIcons(c.modResults, packageName);
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    (c) => {
      writeIconResources(c.modRequest.projectRoot, path.join(c.modRequest.platformProjectRoot, 'app/src/main/res'));
      return c;
    },
  ]);
  return config;
};
module.exports.applyAlternateIcons = applyAlternateIcons;
module.exports.writeIconResources = writeIconResources;
module.exports.aliasSuffix = aliasSuffix;
