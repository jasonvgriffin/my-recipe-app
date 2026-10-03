const { createRunOncePlugin } = require('expo/config-plugins');

const pkg = require('./package.json');

/**
 * Marks the local ML Kit text-recognition module for Expo prebuild.
 * The Android library (and the bundled Latin model) is linked via expo-module.config.json;
 * no Expo account or extra native project is required.
 */
function withMlkitTextRecognition(config) {
  return config;
}

module.exports = createRunOncePlugin(withMlkitTextRecognition, pkg.name, pkg.version);
