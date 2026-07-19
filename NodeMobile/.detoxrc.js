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
    rootDir: '.artifacts',
    plugins: {
      // Auto-capture a screenshot when a spec finishes; keep only the failing
      // ones. Lets us SEE the exact screen state (e.g. a focus-stealing dialog)
      // at the moment a test times out.
      screenshot: {
        shouldTakeAutomaticSnapshots: true,
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: { testDone: true },
      },
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
