const Sequencer = require('@jest/test-sequencer').default;

// Jest's default sequencer runs the biggest file first, which means
// hiking.test.js (the heaviest spec: maps, GPS, SQLite) always eats the
// cold-start penalty (first app launch under swiftshader, Gradle
// instrumentation warm-up). Force login.test.js — the cheapest, most
// reliable flow — to run first instead, so it absorbs that cold-start cost
// and the heavier specs run against an already-warm device.
const WARMUP_SUFFIX = 'login.test.js';

class WarmupFirstSequencer extends Sequencer {
  sort(tests) {
    const sorted = super.sort(tests);
    return [...sorted].sort((a, b) => {
      const aIsWarmup = a.path.endsWith(WARMUP_SUFFIX);
      const bIsWarmup = b.path.endsWith(WARMUP_SUFFIX);
      if (aIsWarmup === bIsWarmup) return 0;
      return aIsWarmup ? -1 : 1;
    });
  }
}

module.exports = WarmupFirstSequencer;
