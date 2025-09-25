module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',

  // Ignore Android build outputs and the packaged nodejs-assets copy
  modulePathIgnorePatterns: [
    '<rootDir>/android/build/',
    '<rootDir>/android/app/build/',
    '<rootDir>/ios/build/',
    '<rootDir>/nodejs-assets/',            // we test the RN app here, not the embedded node bundle
  ],



  // Stable defaults for RN + Jest
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-clone-referenced-element|@react-navigation)/)',
  ],


  moduleNameMapper: {
    '^nodejs-mobile-react-native$': '<rootDir>/__mocks__/nodejs-mobile-react-native.js',
  },
};
