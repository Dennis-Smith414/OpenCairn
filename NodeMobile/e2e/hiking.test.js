const { execSync } = require('child_process');
const path = require('path');

jest.setTimeout(300000);

describe('hiking flow', () => {
	beforeAll(async () => {
		await device.launchApp({
			newInstance: true,
			delete: true,
			permissions: { storage: 'always' },
		});
		const gpxSrc = path.resolve(__dirname, '../__tests__/Downer_Woods.gpx');
		execSync(`adb push "${gpxSrc}" /sdcard/Android/data/com.nodemobile/files/Downer_Woods.gpx`);
	});

	it('Login, create route, simulate hiking, delete route, logout', async () => {
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

		await waitFor(element(by.id('route-card-Test Route'))).toBeVisible().withTimeout(10000);
		await element(by.id('route-card-Test Route')).tap();
		await waitFor(element(by.text('Add to Map'))).toBeVisible().withTimeout(10000);
		await device.disableSynchronization();
		await element(by.text('Add to Map')).tap();
		await waitFor(element(by.text('Added to Map'))).toBeVisible().withTimeout(5000);
		await element(by.text('OK')).tap();
		await element(by.id('tab-map')).tap();

		await waitFor(element(by.id('trip-tracker-start-pause-button'))).toBeVisible().withTimeout(15000);

		const coords = [
			[43.07965296605701, -87.88083743465967],
			[43.079833164515634, -87.8807891508093],
			[43.08001140377402, -87.88069258310861],
			[43.080130882547024, -87.88060674515246],
			[43.08019355984301, -87.88072745477834],
			[43.08026994771078, -87.88081865760675],
			[43.08035417012125, -87.88085621171258],
			[43.08037179805296, -87.8809179077436],
			[43.08057158092473, -87.88097960377459],
			[43.08057941553389, -87.88104398224172],
			[43.08057158092473, -87.88113518507016],
			[43.080599002052395, -87.88126125956829],
			[43.080730231564736, -87.88136587457737],
			[43.08076156991418, -87.88155632754265],
			[43.080824246564966, -87.88172532101886],
			[43.080908468213494, -87.88177092243309],
			[43.08111608387586, -87.88169581422143],
			[43.081165049731425, -87.88160997626525],
			[43.08123556049469, -87.88157242215942],
			[43.081282567625145, -87.88135246239673],
			[43.08132957471952, -87.88128271905734],
			[43.08143142330023, -87.88128271905734],
			[43.081474513033434, -87.88120492840955],
			[43.08151172686955, -87.8811029958366],
			[43.08143142330023, -87.88070867772542],
			[43.081400085293424, -87.88068453580023],
			[43.081370705897484, -87.88054773155758],
			[43.08124731228069, -87.88038410295361],
			[43.08117092563145, -87.88033581910325],
			[43.08105536616061, -87.88036800833684],
			[43.08098289655069, -87.88040556244265],
			[43.080859502152876, -87.88046725847366],
			[43.08080270147351, -87.88048335309044],
			[43.080738066153614, -87.88049140039881],
			[43.08065972021989, -87.88057455591888],
			[43.080602919355314, -87.88061747489697],
			[43.080493234778146, -87.88057723835502],
			[43.08039530195405, -87.88052090719626],
			[43.080340459504164, -87.88049140039881],
			[43.080179849189996, -87.88055041399369],
			[43.08012304788055, -87.88061747489697],
			[43.08009366787224, -87.88065234656665],
			[43.079944808946934, -87.88073550208671],
			[43.079772445529, -87.88083743465967],
			[43.07965884210207, -87.88085621171258],
		];

		await element(by.id('trip-tracker-start-pause-button')).tap();
		await new Promise(resolve => setTimeout(resolve, 3000));

		const checkpoints = [coords[0], coords[5], coords[10], coords[15], coords[20], coords[25], coords[30], coords[35], coords[40], coords[44]];
		for (const [lat, lon] of checkpoints) {
			execSync(`adb emu geo fix ${lon} ${lat}`);
			await new Promise(resolve => setTimeout(resolve, 8000));
		}

		await element(by.id('trip-tracker-start-pause-button')).tap();

		await element(by.id('tab-account')).tap();
		await waitFor(element(by.text('My Account'))).toBeVisible().withTimeout(8000);
		await element(by.text('My Routes')).tap();
		await waitFor(element(by.id('user-item-delete-Test Route'))).toBeVisible().withTimeout(10000);
		await element(by.id('user-item-delete-Test Route')).tap();
		await waitFor(element(by.text('Are you sure you want to delete this route?'))).toBeVisible().withTimeout(5000);
		await element(by.text('Delete')).tap();

		await element(by.id('account-settings-button')).tap();
		await waitFor(element(by.id('settings-logout-button'))).toBeVisible().withTimeout(10000);
		await element(by.id('settings-logout-button')).tap();
		await device.enableSynchronization();
		await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
		console.log('[TEST] PASS');
	});
});
