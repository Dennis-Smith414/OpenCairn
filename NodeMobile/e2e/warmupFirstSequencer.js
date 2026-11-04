const Sequencer = require('@jest/test-sequencer').default;

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
