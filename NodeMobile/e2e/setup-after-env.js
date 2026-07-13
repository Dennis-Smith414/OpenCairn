// Detox is inherently flaky on CI's cold first app-launch (software rendering,
// Metro's first bundle transform). Retry a failed spec so a one-off launch/
// handshake hiccup doesn't fail the whole run. The app is warmed before the
// suite too (see e2e.yml); this is the safety net on top of that.
jest.retryTimes(2, { logErrorsBeforeRetry: true });
