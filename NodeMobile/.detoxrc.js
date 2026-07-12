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
