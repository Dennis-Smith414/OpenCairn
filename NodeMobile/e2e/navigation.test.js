// Broad navigation smoke test: exercises the main tabs + RouteSelect/RouteCreate
// navigation + the map screen render, without depending on any seeded data (the
// hermetic DB starts empty of routes). Complements the deeper flow specs.
describe('Navigation & browse smoke', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it('login, browse route controls, open+close create, map, logout', async () => {
    console.log('[TEST] Login...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('landing-login-button')).tap();
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('login-email-input')).typeText(process.env.TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(process.env.TEST_PASSWORD);
    await element(by.id('login-password-input')).tapReturnKey();
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(20000);

    console.log('[TEST] Routes tab + browse controls...');
    await element(by.id('tab-routes')).tap();
    await waitFor(element(by.text('Select Routes'))).toBeVisible().withTimeout(15000);
    await expect(element(by.id('route-select-search-input'))).toBeVisible();
    await expect(element(by.id('route-select-nearby-button'))).toBeVisible();
    await expect(element(by.id('route-select-favorites-button'))).toBeVisible();

    console.log('[TEST] Open Create Route then back...');
    await element(by.id('route-select-create-button')).tap();
    await waitFor(element(by.text('Create New Route'))).toBeVisible().withTimeout(15000);
    await element(by.id('route-create-back-button')).tap();
    await waitFor(element(by.text('Select Routes'))).toBeVisible().withTimeout(15000);

    console.log('[TEST] Map tab renders...');
    await element(by.id('tab-map')).tap();
    await waitFor(element(by.id('map-center-button'))).toBeVisible().withTimeout(20000);

    console.log('[TEST] Account -> Settings -> logout...');
    await element(by.id('tab-account')).tap();
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(10000);
    await element(by.id('account-settings-button')).tap();
    await device.disableSynchronization();
    await waitFor(element(by.id('settings-logout-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('settings-logout-button')).tap();
    await device.enableSynchronization();
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] PASS');
  });
});
