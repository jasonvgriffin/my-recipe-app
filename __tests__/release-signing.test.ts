/** Config plugin that wires release signing into the generated android/app/build.gradle (AGENTS.md "Signing"). */
const { addReleaseSigning } = require('../plugins/with-release-signing');

const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('with-release-signing', () => {
  it('adds an env-driven release config and uses it only for the release build type', () => {
    const out: string = addReleaseSigning(TEMPLATE);
    expect(out).toContain("storeFile file(releaseKeystore)");
    expect(out).toContain("System.getenv('ANDROID_KEY_ALIAS')");
    expect(out).toContain(
      "signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
    );
    // Debug build type keeps the debug keystore.
    expect(out).toMatch(/debug \{\n\s+signingConfig signingConfigs\.debug\n/);
    // v1 + v2 + v3 schemes on the release config (v1.0.1).
    expect(out).toMatch(/enableV1Signing true[\s\S]*enableV2Signing true[\s\S]*enableV3Signing true/);
    // No secret values are baked into the file.
    expect(out).not.toMatch(/storePassword '(?!android')/);
  });

  it('is idempotent', () => {
    const once: string = addReleaseSigning(TEMPLATE);
    expect(addReleaseSigning(once)).toBe(once);
  });

  it('fails loudly when the template changes shape', () => {
    expect(() => addReleaseSigning('android {}')).toThrow(/signingConfigs/);
  });
});
