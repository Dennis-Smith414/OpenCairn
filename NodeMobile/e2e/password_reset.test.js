// Password reset (email OTP) flow — the "email test".
//
// The reset code is only ever stored bcrypt-hashed and is emailed via SMTP, so
// there's no inbox to read in the hermetic stack. The backend echoes the code
// as `dev_code` in the forgot-password response OUTSIDE production only (gated on
// NODE_ENV; see OpenCairnDatabase routes/auth.js). We drive the real UI for both
// steps and use a direct API call purely to LEARN the current code.
//
// Direct API calls hit the backend on the RUNNER HOST (published :5102); the app
// inside the emulator reaches the same backend at 10.0.2.2:5102.
const { api, launchFresh, expectSubmitSucceeded } = require('./helpers');

describe('Password reset (email OTP) flow', () => {
  const oldPassword = 'OldPass1!';
  const newPassword = 'NewPass1!';
  let username;
  let email;

  // beforeEach, not beforeAll — jest.retryTimes re-runs this hook but NOT
  // beforeAll, so a retry gets a clean install AND a fresh target user whose
  // password hasn't already been rotated by the failed attempt.
  beforeEach(async () => {
    const stamp = `${Date.now()}`.slice(-10);
    username = `e2e_reset_${stamp}`;
    email = `e2e_reset_${stamp}@opencairn.xyz`;

    // Register a throwaway user via the API so the reset flow has a real target
    // and we never touch the shared seed user's password.
    const reg = await api('/api/auth/register', { username, email, password: oldPassword });
    if (reg.status !== 201 && reg.status !== 409) {
      throw new Error(`setup registration failed: ${reg.status} ${reg.text}`);
    }
    await launchFresh();
  });

  it('requests a code, resets the password, and logs in with the new one', async () => {
    console.log('[TEST] Landing -> Login -> Forgot password...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('landing-login-button')).tap();
    await waitFor(element(by.id('login-forgot-password-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('login-forgot-password-button')).tap();

    console.log('[TEST] Requesting a reset code...');
    await waitFor(element(by.id('forgot-email-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('forgot-email-input')).typeText(email);
    // forgot-email-input has returnKeyType="send" + onSubmitEditing, so tapReturnKey
    // already submits and advances the step — a follow-up tap on forgot-send-button
    // would fail because the button no longer exists.
    await element(by.id('forgot-email-input')).tapReturnKey();

    console.log('[TEST] Waiting for the reset (code entry) step...');
    await waitFor(element(by.id('reset-code-input'))).toBeVisible().withTimeout(15000);

    // Learn the current code. This regenerates + overwrites it, so the code we
    // type below is guaranteed to be the one the backend will verify.
    console.log('[TEST] Fetching dev_code out-of-band...');
    const forgot = await api('/api/auth/forgot-password', { email });
    const code = forgot.json && forgot.json.dev_code;
    if (!code) throw new Error(`no dev_code in response: ${forgot.status} ${forgot.text}`);

    console.log('[TEST] Entering code + new password...');
    await element(by.id('reset-code-input')).typeText(String(code));
    await element(by.id('reset-password-input')).typeText(newPassword);
    await element(by.id('reset-confirm-input')).typeText(newPassword);
    // Submit via reset-confirm's onSubmitEditing (returnKeyType="done"), same as the
    // request step's email field. tapReturnKey fires handleReset directly in RN — an
    // Espresso tap on reset-submit-button hit a window-focus race as the keyboard
    // dismissed ("has-window-focus=false"), so the tap never landed and the success
    // Alert never showed.
    await element(by.id('reset-confirm-input')).tapReturnKey();
    // Fails fast with the screen's own error text (bad code, weak password, ...)
    // instead of burning 20s to report only "matcher timed out".
    await expectSubmitSucceeded({
      successText: 'Your password has been reset. Please log in with your new password.',
      errorId: 'reset-error',
      timeout: 20000,
    });
    await element(by.text('OK')).tap();

    console.log('[TEST] Logging in with the NEW password...');
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('login-email-input')).typeText(email);
    await element(by.id('login-password-input')).typeText(newPassword);
    await element(by.id('login-password-input')).tapReturnKey();
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(20000);
    console.log('[TEST] PASS');
  });
});
