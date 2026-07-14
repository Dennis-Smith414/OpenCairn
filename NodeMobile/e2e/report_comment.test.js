// Report-a-comment flow — the "report button test".
//
// The report endpoint fires moderateComment() WITHOUT awaiting it and returns
// { ok: true } immediately, so it succeeds even though the OpenAI moderation
// microservice isn't part of the hermetic stack. We create a fresh route (so
// there's exactly ONE comment, hence one report button), post a comment, and
// report it. The confirm Alert button is "Submit Report" (deliberately distinct
// from the comment row's "Report" label to avoid an ambiguous by.text match).
const { execSync } = require('child_process');
const path = require('path');

jest.setTimeout(300000);

describe('Report comment flow', () => {
  const stamp = Date.now();
  const routeName = `Report Route ${stamp}`;
  const commentText = `E2E report target ${stamp}`;

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      permissions: { storage: 'always', location: 'always' },
    });
    // delete:true wipes scoped storage; recreate the dir (needs `adb root`) so the
    // GPX push lands instead of silently no-op'ing.
    execSync('adb shell mkdir -p /sdcard/Android/data/com.nodemobile/files');
    const gpxSrc = path.resolve(__dirname, '../__tests__/Downer_Woods.gpx');
    execSync(`adb push "${gpxSrc}" /sdcard/Android/data/com.nodemobile/files/Downer_Woods.gpx`);
  });

  it('login, create route, post a comment, report it', async () => {
    console.log('[TEST] Login...');
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(30000);
    await element(by.id('landing-login-button')).tap();
    await waitFor(element(by.id('login-email-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('login-email-input')).typeText(process.env.TEST_EMAIL);
    await element(by.id('login-password-input')).typeText(process.env.TEST_PASSWORD);
    await element(by.id('login-password-input')).tapReturnKey();
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(20000);

    console.log('[TEST] Create a route to comment on...');
    await element(by.id('tab-routes')).tap();
    await waitFor(element(by.text('Select Routes'))).toBeVisible().withTimeout(15000);
    await element(by.id('route-select-create-button')).tap();
    await waitFor(element(by.text('Create New Route'))).toBeVisible().withTimeout(15000);
    await element(by.id('route-name-input')).typeText(routeName);
    await element(by.id('route-name-input')).tapReturnKey();
    await element(by.id('route-create-pick-files-button')).tap();
    await waitFor(element(by.text('Downer_Woods.gpx'))).toExist().withTimeout(8000);
    await device.disableSynchronization();
    await element(by.id('route-create-submit-button')).tap();
    await waitFor(element(by.text('Route created with 1 GPX file.'))).toBeVisible().withTimeout(30000);
    await element(by.text('OK')).tap();
    await device.enableSynchronization();

    console.log('[TEST] Open route detail...');
    await waitFor(element(by.id(`route-card-${routeName}`))).toBeVisible().withTimeout(10000);
    await element(by.id(`route-card-${routeName}`)).tap();
    await waitFor(element(by.text('Add to Map'))).toBeVisible().withTimeout(10000);

    console.log('[TEST] Post a comment...');
    await waitFor(element(by.id('comment-input'))).toBeVisible().withTimeout(10000);
    await element(by.id('comment-input')).typeText(commentText);
    await element(by.id('comment-input')).tapReturnKey();
    await device.disableSynchronization();
    await element(by.id('comment-submit-button')).tap();
    await device.enableSynchronization();
    await waitFor(element(by.text(commentText))).toBeVisible().withTimeout(15000);

    console.log('[TEST] Report the comment...');
    // Fresh route => exactly one comment => one report button. Match by id regex.
    await element(by.id(/^comment-report-/)).tap();
    await waitFor(element(by.text('Report this comment as harmful or inappropriate?'))).toBeVisible().withTimeout(10000);
    await device.disableSynchronization();
    await element(by.text('Submit Report')).tap();
    await waitFor(element(by.text('Report submitted'))).toBeVisible().withTimeout(20000);
    await element(by.text('OK')).tap();
    await device.enableSynchronization();

    console.log('[TEST] Cleanup: delete route + logout...');
    await element(by.id('tab-account')).tap();
    await waitFor(element(by.text('My Account'))).toExist().withTimeout(10000);
    await element(by.text('My Routes')).tap();
    await waitFor(element(by.id(`user-item-delete-${routeName}`))).toBeVisible().withTimeout(10000);
    await element(by.id(`user-item-delete-${routeName}`)).tap();
    await waitFor(element(by.text('Are you sure you want to delete this route?'))).toBeVisible().withTimeout(5000);
    await element(by.text('Delete')).tap();
    await element(by.id('account-settings-button')).tap();
    await waitFor(element(by.id('settings-logout-button'))).toBeVisible().withTimeout(10000);
    await element(by.id('settings-logout-button')).tap();
    await waitFor(element(by.id('landing-login-button'))).toBeVisible().withTimeout(10000);
    console.log('[TEST] PASS');
  });
});
