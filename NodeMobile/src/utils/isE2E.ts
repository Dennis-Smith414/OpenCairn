import { E2E } from '@env';

// Detox (Android, v20+) has no JS-facing native module to detect at runtime —
// it works purely through native Espresso IdlingResources, nothing registered
// into the RN bridge. `NativeModules.DetoxSync` (the previous check here) can
// never exist; this was dead code. Baked in at Metro/babel transform time via
// react-native-dotenv instead: set E2E=true in NodeMobile/.env before
// starting Metro for a Detox run.
console.log('[isE2E] @env E2E =', E2E);

export const isE2E: boolean = E2E === 'true';
