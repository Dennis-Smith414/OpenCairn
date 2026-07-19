// Warm-up spec — intentionally does almost nothing.
//
// On the headless CI runner the FIRST spec to run pays the full cold-start cost:
// a fresh Metro has to transform the bundle on its first request, and the first
// cold `launchApp` (delete:true) races that transform + the first network round
// trip. Whichever real spec ran first kept timing out on it (hiking, since jest's
// default sequencer runs the largest file first on a fresh cache).
//
// This spec exists purely to absorb that cost. It boots the app cold, waits for
// the landing screen, and returns — so every subsequent spec launches warm. The
// custom testSequencer (e2e/sequencer.js) forces this file to run first.
describe('Warm-up', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it('boots the app and reaches the landing screen', async () => {
    console.log('[WARMUP] Waiting for landing screen (absorbs cold start)...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(60000);
    console.log('[WARMUP] App is warm.');
  });
});
