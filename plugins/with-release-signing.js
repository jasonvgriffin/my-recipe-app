/**
 * Expo config plugin: Android release signing from environment variables (android/ is generated, never committed).
 *
 * At Gradle time, when ANDROID_KEYSTORE_PATH is set, `assembleRelease` is signed with that keystore using
 * ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD. When it is not set (local builds,
 * fork PRs without secrets) the release build keeps the Expo template's debug keystore.
 * The release config signs with APK Signature Scheme v1 + v2 + v3 (v1.0.1).
 * CI decodes the keystore from GitHub secrets — see .github/workflows/android.yml and AGENTS.md.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated my-recipe-app release signing';

function addReleaseSigning(contents) {
  if (contents.includes(MARKER)) return contents;

  const signingConfigs = /signingConfigs\s*\{/;
  if (!signingConfigs.test(contents)) {
    throw new Error('with-release-signing: signingConfigs block not found in android/app/build.gradle');
  }
  let next = contents.replace(
    signingConfigs,
    `signingConfigs {
        ${MARKER}
        release {
            def releaseKeystore = System.getenv('ANDROID_KEYSTORE_PATH')
            if (releaseKeystore) {
                storeFile file(releaseKeystore)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
            // Sign with every scheme (v1 JAR + v2 + v3) so any installer accepts it: AGP drops v1 when
            // minSdk >= 24 and only adds v3 on key rotation; some OEM installers are pickier than the platform.
            enableV1Signing true
            enableV2Signing true
            enableV3Signing true
        }`,
  );

  // The release *buildType* (not the signingConfigs entry above) uses the debug config in the template.
  const releaseBuildType = /(buildTypes\s*\{[\s\S]*?release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/;
  if (!releaseBuildType.test(next)) {
    throw new Error('with-release-signing: release buildType signingConfig not found in android/app/build.gradle');
  }
  next = next.replace(
    releaseBuildType,
    "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
  );
  return next;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('with-release-signing: expected a Groovy android/app/build.gradle');
    }
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addReleaseSigning = addReleaseSigning;
