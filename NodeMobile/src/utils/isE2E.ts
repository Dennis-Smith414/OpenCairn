import { E2E } from '@env';

console.log('[isE2E] @env E2E =', E2E);

export const isE2E: boolean = E2E === 'true';
