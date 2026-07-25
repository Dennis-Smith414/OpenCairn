// Shared E2E helpers.
//
// The theme here is: when a spec fails, it should say WHY. A bare
// `waitFor(...).toBeVisible().withTimeout(20000)` on a success dialog can only
// ever report "timeout expired without matching of given matcher", which is the
// same message whether the app showed a validation error, the request 500'd, or
// the dialog rendered and Detox just couldn't see it. These helpers turn each of
// those into a distinct, readable failure.

// The backend runs on the RUNNER HOST (docker publishes :5102); the app inside
// the emulator reaches the same backend at 10.0.2.2:5102.
const HOST_API = process.env.HOST_API || 'http://localhost:5102';

async function api(path, body) {
  const res = await fetch(`${HOST_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// Every spec starts from a clean install. This lives in beforeEach (NOT
// beforeAll) on purpose: jest.retryTimes re-runs the test body and beforeEach,
// but NOT beforeAll. With the launch in beforeAll, a spec that died mid-flow
// left the app parked on some inner screen, so both retries then failed on
// "landing screen not visible" — burying the real first failure under two
// meaningless ones.
async function launchFresh(opts = {}) {
  await device.launchApp({ newInstance: true, delete: true, ...opts });
}

// Is this element on screen right now? Never throws.
async function isVisible(matcher) {
  try {
    await expect(element(matcher)).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

// The rendered string of an element, or null if it isn't there.
async function textOf(matcher) {
  try {
    const attrs = await element(matcher).getAttributes();
    const node = attrs.elements ? attrs.elements[0] : attrs;
    return node && node.text ? node.text : null;
  } catch {
    return null;
  }
}

/**
 * Wait for a submit to resolve one way or the other.
 *
 * Polls the success dialog's text AND the screen's inline error label, so a
 * rejected submit fails in ~1s with the app's own message instead of burning
 * the full timeout and reporting nothing.
 *
 * @returns {Promise<void>} resolves when the success text appears
 * @throws if the inline error appears, or if neither does before the timeout
 */
async function expectSubmitSucceeded({ successText, errorId, timeout = 20000 }) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await isVisible(by.text(successText))) return;

    const inlineError = await textOf(by.id(errorId));
    if (inlineError) {
      throw new Error(`the app rejected the submit with: "${inlineError}"`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `neither the success dialog ("${successText}") nor an inline error (${errorId}) ` +
    `appeared within ${timeout}ms — the submit handler most likely never fired. ` +
    `See the screenshot + uiHierarchy artifact for this test.`,
  );
}

module.exports = { HOST_API, api, launchFresh, isVisible, textOf, expectSubmitSucceeded };
