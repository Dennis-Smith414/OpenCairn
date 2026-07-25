const { launchFresh } = require('./helpers');

describe('Login flow', () => {
  // beforeEach, not beforeAll — jest.retryTimes re-runs this hook, so a retry
  // starts from a clean install instead of wherever the last attempt died.
  beforeEach(async () => {
    await launchFresh();
  });

  it('should log in and log out successfully', async () => {
    console.log('[TEST] Waiting for landing screen...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] Tapping login button...');
    await element(by.id('landing-login-button')).tap();

    console.log('[TEST] Waiting for email input...');
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] Typing email...');
    await element(by.id('login-email-input')).typeText(process.env.TEST_EMAIL);
    console.log('[TEST] Typing password...');
    await element(by.id('login-password-input')).typeText(process.env.TEST_PASSWORD);
    console.log('[TEST] Submitting via return key...');
    await element(by.id('login-password-input')).tapReturnKey();

    console.log('[TEST] Waiting for Account screen...');
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(15000);
    console.log('[TEST] On Account screen, tapping Settings button...');
    await waitFor(element(by.id('account-settings-button'))).toBeVisible().withTimeout(5000);
    await element(by.id('account-settings-button')).tap();
    console.log('[TEST] On Settings screen, tapping logout...');
    await device.disableSynchronization();
    await waitFor(element(by.id('settings-logout-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('settings-logout-button')).tap();
    await device.enableSynchronization();

    console.log('[TEST] Waiting to return to landing...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] PASS');
  });
});
