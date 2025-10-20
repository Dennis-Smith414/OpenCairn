// NodeMobile/src/config/env.ts
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

let COMPUTER_IP: string | null = null;

// Try to import the auto-generated IP
try {
  const ipConfig = require('./ip');
  COMPUTER_IP = ipConfig.COMPUTER_IP;
  console.log('[ENV] Loaded computer IP from config:', COMPUTER_IP);
} catch (error) {
  console.warn('[ENV] No IP config found, will use fallback');
}

// Figure out if user is running on android or hardware, set API_BASE to that
function determineApiBase(): string {
  // Try emulator first then computer ip then 
  if (Platform.OS === 'android') {
    console.log('[ENV] Using Android emulator fallback');
    return 'http://10.0.2.2:5100';
  } else {
    if (COMPUTER_IP) {
        console.log(`[ENV] Using auto-detected IP: ${COMPUTER_IP}`);
        return `http://${COMPUTER_IP}:5100`;
    }
  }

  console.warn('[ENV] Using localhost fallback');
  return 'http://localhost:5100';
}

export const API_BASE = determineApiBase();
console.log(`[ENV] Final API_BASE: ${API_BASE}`);