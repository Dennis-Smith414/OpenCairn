// Custom jest test sequencer: force warmup.test.js to run FIRST so it absorbs
// the cold-start cost (fresh Metro bundle transform + first cold launchApp).
// Without this, jest's default sequencer runs the largest spec first on a fresh
// cache, which kept feeding the cold start to a real test (hiking) and failing it.
const Sequencer = require('@jest/test-sequencer').default;

class WarmupFirstSequencer extends Sequencer {
  sort(tests) {
    const sorted = super.sort(tests);
    return [...sorted].sort((a, b) => {
      const aWarm = a.path.endsWith('warmup.test.js');
      const bWarm = b.path.endsWith('warmup.test.js');
      if (aWarm && !bWarm) return -1;
      if (bWarm && !aWarm) return 1;
      return 0;
    });
  }
}

module.exports = WarmupFirstSequencer;
