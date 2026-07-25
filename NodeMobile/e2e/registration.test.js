// Registration: create a brand-new account from the landing screen.
// Uses a timestamped username/email so re-runs never collide on the unique
// constraint. Mirrors the login test's structure + patterns.
const { api, launchFresh, expectSubmitSucceeded } = require('./helpers');

describe('Registration flow', () => {
  const password = 'TestPass1!'; // >=8 chars, 1 uppercase, 1 symbol (backend strongPwd)
  let username;
  let email;

  // beforeEach, not beforeAll — jest.retryTimes re-runs this hook but NOT
  // beforeAll, so with the launch in beforeAll a mid-flow failure left the app
  // parked on the create-account screen and both retries then died on "landing
  // screen not visible", burying the real first failure under two bogus ones.
  //
  // Fresh creds per attempt for the same reason: if an attempt got as far as
  // creating the account, reusing its username would make the retry fail with a
  // 409 instead of reproducing the original problem.
  beforeEach(async () => {
    const stamp = `${Date.now()}`.slice(-10);
    username = `e2e_reg_${stamp}`;
    email = `e2e_reg_${stamp}@opencairn.xyz`;
    await launchFresh();
  });

  it('creates a new account and returns to landing', async () => {
    console.log('[TEST] Waiting for landing screen...');
    await waitFor(element(by.id('landing-create-account-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('landing-create-account-button')).tap();

    console.log('[TEST] Filling the account form...');
    await waitFor(element(by.id('create-account-username-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('create-account-username-input')).typeText(username);
    await element(by.id('create-account-email-input')).typeText(email);
    await element(by.id('create-account-password-input')).typeText(password);
    await element(by.id('create-account-confirm-input')).typeText(password);

    console.log('[TEST] Submitting...');
    // Submit via the confirm field's onSubmitEditing (returnKeyType="done"), exactly
    // like the login screen does. tapReturnKey fires handleCreateAccount directly in
    // RN — an Espresso tap on the submit button hit a window-focus race as the
    // keyboard dismissed ("has-window-focus=false"), so the tap never landed.
    await element(by.id('create-account-confirm-input')).tapReturnKey();

    // Turn the submit into a real diagnosis instead of a bare matcher timeout: an
    // inline error fails fast with the app's own message, and a silent timeout is
    // cross-checked against the backend below.
    try {
      await expectSubmitSucceeded({
        successText: 'Account created. Please log in.',
        errorId: 'create-account-error',
        timeout: 20000,
      });
    } catch (e) {
      throw new Error(`${e.message}\n${await diagnoseSubmit()}`);
    }

    await element(by.text('OK')).tap();

    console.log('[TEST] Back on landing...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] PASS');
  });

  // Ask the backend whether the account actually landed. This separates the two
  // failure modes that look identical from the UI: the request never left the app
  // (handler never fired / network), versus the account WAS created and only the
  // success dialog went missing (a Detox matching problem).
  async function diagnoseSubmit() {
    try {
      const login = await api('/api/auth/login', { email, password });
      if (login.status === 200) {
        return 'BACKEND CHECK: the account EXISTS — registration worked and only the ' +
               'success dialog was never matched.';
      }
      const reg = await api('/api/auth/register', { username, email, password });
      if (reg.status === 201) {
        return 'BACKEND CHECK: no such account, and registering the same payload straight ' +
               'from the test host succeeded (201) — the backend is fine, so the app ' +
               'never sent the request.';
      }
      return 'BACKEND CHECK: no such account; the same payload from the test host ' +
             `returned ${reg.status} ${reg.text}`;
    } catch (err) {
      return `BACKEND CHECK: could not reach the backend from the test host: ${err.message}`;
    }
  }
});
