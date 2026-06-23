const { execSync } = require('child_process');
const path = require('path');

describe('create_route flow', () => {
	beforeAll(async () => {
		await device.launchApp({
			newInstance: true,
			delete: true,
			permissions: { storage: 'always' },
		});
		const gpxSrc = path.resolve(__dirname, '../__tests__/Downer_Woods.gpx');
		execSync(`adb push "${gpxSrc}" /sdcard/Android/data/com.nodemobile/files/Downer_Woods.gpx`);
	});

	it('Login, create_route, delete route, log out', async () => {
		console.log('[TEST] Waiting for landing screen...');
		await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
		console.log('[TEST] Tapping login button...');
		await element(by.id('landing-login-button')).tap();

		console.log('[TEST] Waiting for username input...');
		await waitFor(element(by.id('login-username-input'))).toBeVisible().withTimeout(10000);
		console.log('[TEST] Typing username...');
		await element(by.id('login-username-input')).typeText(process.env.TEST_USERNAME);
		console.log('[TEST] Typing password...');
		await element(by.id('login-password-input')).typeText(process.env.TEST_PASSWORD);
		console.log('[TEST] Submitting via return key...');
		await element(by.id('login-password-input')).tapReturnKey();

		console.log('[TEST] Waiting for Account screen...');
		await waitFor(element(by.text('My Account'))).toBeVisible().withTimeout(15000);

		console.log('[TEST] Moving to routes screen...');
		await element(by.id('tab-routes')).tap();
		await waitFor(element(by.text('Select Routes'))).toBeVisible().withTimeout(15000);

		console.log('[TEST] Opening create route screen...');
		await element(by.id('route-select-create-button')).tap();
		await waitFor(element(by.text('Create New Route'))).toBeVisible().withTimeout(15000);

		console.log('[TEST] Entering route name...');
		await element(by.id('route-name-input')).typeText('Test Route');
		await element(by.id('route-name-input')).tapReturnKey();

		console.log('[TEST] Picking GPX file...');
		await element(by.id('route-create-pick-files-button')).tap();
		await waitFor(element(by.text('Downer_Woods.gpx'))).toBeVisible().withTimeout(8000);

		console.log('[TEST] Submitting route...');
		await device.disableSynchronization();
		await element(by.id('route-create-submit-button')).tap();
		await waitFor(element(by.text('Route created with 1 GPX file.'))).toBeVisible().withTimeout(30000);
		await element(by.text('OK')).tap();
		await device.enableSynchronization();

		await element(by.id('tab-account')).tap();
		await waitFor(element(by.text('My Account'))).toBeVisible().withTimeout(8000);
		await element(by.text('My Routes')).tap();
		await element(by.id('user-item-delete-Test Route')).tap();
		await waitFor(element(by.text('Are you sure you want to delete this route?'))).toBeVisible().withTimeout(8000);
		await element(by.text('Delete')).tap();

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
