module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        // Resolved relative to process.cwd() (wherever Metro/babel actually
        // runs from, i.e. this directory) — '../.env' pointed one level too
        // high, at the repo root, where no .env exists. Latent until isE2E.ts
        // started reading from @env.
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};
