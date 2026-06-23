import { NativeModules } from 'react-native';

console.log('[isE2E] NativeModules keys:', Object.keys(NativeModules).join(', '));
console.log('[isE2E] DetoxSync:', NativeModules.DetoxSync);

export const isE2E: boolean = NativeModules.DetoxSync != null;
