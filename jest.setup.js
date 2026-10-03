jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
}));

// Native camera / gallery / ML Kit are not available under Jest. Screen tests override these when they
// need to simulate a scan or a photo.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: () => React.createElement(View, { testID: 'barcode-camera' }),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true, status: 'granted' }, jest.fn(), jest.fn()],
  };
});

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('@/receipts/ocr', () => ({
  recognizeReceiptText: jest.fn(async () => ''),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4, LOW: 2, MAX: 5, MIN: 1, NONE: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval', CALENDAR: 'calendar' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
  isAvailableAsync: jest.fn(async () => true),
}));
