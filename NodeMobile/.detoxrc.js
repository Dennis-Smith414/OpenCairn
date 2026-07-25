/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  artifacts: {
    // NOT a dotdir: actions/upload-artifact@v4 skips hidden files by default, so
    // a '.artifacts' rootDir uploaded as an empty artifact and every CI failure
    // had to be debugged blind. Keep this name in sync with e2e.yml's upload path.
    rootDir: 'artifacts',
    plugins: {
      // Auto-capture a screenshot when a spec finishes; keep only the failing
      // ones. Lets us SEE the exact screen state (e.g. a focus-stealing dialog)
      // at the moment a test times out.
      screenshot: {
        shouldTakeAutomaticSnapshots: true,
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: { testDone: true },
      },
      // The view-hierarchy XML at the moment of failure. A screenshot shows a
      // dialog is up; this says which testIDs/text actually existed and whether
      // they were visible — the difference between "never rendered" and
      // "rendered but under the 75%-visible threshold".
      uiHierarchy: 'enabled',
      // Per-test logcat, kept for failures only (the CLI passes --record-logs all).
      log: { enabled: true, keepOnlyFailedTestsArtifacts: true },
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew :app:assembleDebug :app:assembleAndroidTest -DtestBuildType=debug',
      reversePorts: [8081, 8099],
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      headless: true,
      gpuMode: 'swiftshader_indirect',
      device: {
        avdName: 'Medium_Phone_API_36.1',
      },
    },
    phone: {
      type: 'android.attached',
      device: {
        adbName: 'ZL8323G3C9',
      },
    },
  },
  configurations: {
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.phone.debug': {
      device: 'phone',
      app: 'android.debug',
    },
  },
};
