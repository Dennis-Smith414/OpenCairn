// Warm-up spec — intentionally asserts almost nothing; it exists to absorb the
// cold-start cost so the real specs run warm.
//
// The FIRST spec pays for: Metro's first bundle transform, the first cold
// `launchApp` (swiftshader graphics), the first ART/dex JIT of the app code, AND
// the first login round-trip + post-login render. Warming only the landing screen
// is NOT enough — hiking kept dying on login → My Account because THAT path was
// still cold. So this spec drives a full login all the way to the Account screen,
// which is exactly the path the real specs hit first. The custom testSequencer
// (e2e/sequencer.js) forces this file to run first.
const { launchFresh } = require('./helpers');

describe('Warm-up', () => {
  beforeEach(async () => {
    await launchFresh();
  });

  it('logs in and reaches the account screen (absorbs cold start)', async () => {
    console.log('[WARMUP] Waiting for landing screen...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(90000);
    await element(by.id('landing-login-button')).tap();

    console.log('[WARMUP] Logging in to warm the auth + render path...');
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(30000);
    await element(by.id('login-email-input')).typeText(process.env.TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(process.env.TEST_PASSWORD);
    await element(by.id('login-password-input')).tapReturnKey();

    // Generous timeout: this is the cold login the real specs would otherwise eat.
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(90000);
    console.log('[WARMUP] Login path is warm.');
  });
});
