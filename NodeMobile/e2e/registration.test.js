// Registration: create a brand-new account from the landing screen.
// Uses a timestamped username/email so re-runs never collide on the unique
// constraint. Mirrors the login test's structure + patterns.
describe('Registration flow', () => {
  const stamp = Date.now();
  const username = `e2e_reg_${stamp}`;
  const email = `e2e_reg_${stamp}@opencairn.xyz`;
  const password = 'TestPass1!'; // >=8 chars, 1 uppercase, 1 symbol (backend strongPwd)

  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
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

    console.log('[TEST] Submitting (return key on confirm fires onSubmitEditing)...');
    // The confirm field has returnKeyType="done" + onSubmitEditing={handleCreateAccount},
    // so tapReturnKey both dismisses the keyboard and submits the registration.
    await device.disableSynchronization();
    await element(by.id('create-account-confirm-input')).tapReturnKey();
    await waitFor(element(by.text('Account created. Please log in.'))).toBeVisible().withTimeout(20000);
    await element(by.text('OK')).tap();
    await device.enableSynchronization();

    console.log('[TEST] Back on landing...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] PASS');
  });
});
