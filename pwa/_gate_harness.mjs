import { readFileSync } from 'node:fs';
import { configureGrounding, ruleInterpret, retrieveTopScore } from './edgeAI.js';
import { normalizeFeedseedCalls, _gateCalls } from './feedseedBackend.js';

const trails = JSON.parse(readFileSync(new URL('./trails.min.json', import.meta.url)));
configureGrounding({ getNames: () => trails });

// Simulate the model output per case: the "model" emits a plausible call for
// commands and (worst case) a hallucinated call for negatives. We assert the
// GATE's final decision matches expectation.
//  fields: [utterance, expectFire(bool), simulatedModelCalls]
const C = (name, args = {}) => ({ name, arguments: args });
const CASES = [
  ['how far to poo poo point', true, [C('distance_to_waypoint', { name: 'Poo Poo Point' })]],
  ['how far to mailbox peak in miles', true, [C('distance_to_waypoint', { name: 'Mailbox Peak' })]],
  ['distance to rattlesnake ledge', true, [C('distance_to_waypoint', { name: 'Rattlesnake Ledge' })]],
  ['how far to mail box peek', true, [C('distance_to_waypoint', { name: 'Mailbox Peak' })]],
  ['how far to twinfalls', true, [C('distance_to_waypoint', { name: 'Twin Falls' })]],
  ['tell me about mount si', true, [C('query_waypoint', { name: 'Mount Si' })]],
  ['what is snow lake', true, [C('query_waypoint', { name: 'Snow Lake' })]],
  ['where is wallace falls', true, [C('query_waypoint', { name: 'Wallace Falls' })]],
  ['drop a cairn called lunch spot', true, [C('drop_cairn', { label: 'lunch spot' })]],
  ['mark this spot', true, [C('drop_cairn')]],
  ['where am i', true, [C('get_location')]],
  ['what are my coordinates', true, [C('get_location')]],
  ['list my waypoints', true, [C('list_waypoints')]],
  ['what waypoints do i have', true, [C('list_waypoints')]],
  ['pause the music', true, [C('control_music', { action: 'pause' })]],
  ['skip to the next song', true, [C('control_music', { action: 'skip_next' })]],
  ['turn up the volume', true, [C('control_music', { action: 'volume_up' })]],
  ['am i off the trail', true, [C('check_off_route')]],
  ['am i still on the path', true, [C('check_off_route')]],
  ['SOS I broke my ankle', true, [C('dial_emergency')]],
  ['call for help', true, [C('dial_emergency')]],
  // Negatives — worst case: model hallucinates a command (incl. false emergency)
  ['what a beautiful day out here', false, [C('dial_emergency')]],
  ["i'm so tired", false, [C('control_music', { action: 'play' })]],
  ['whats the weather tomorrow', false, [C('query_waypoint', { name: 'Weather' })]],
  ['how far to the summit and pause the music', true,
    [C('distance_to_waypoint', { name: 'the summit' }), C('control_music', { action: 'pause' })]],
];

let pass = 0, fail = 0;
const failed = [];
for (const [q, expectFire, model] of CASES) {
  const gated = _gateCalls(q, model.map((c) => ({ ...c, arguments: { ...c.arguments } })));
  const fired = gated.length > 0;
  const ok = fired === expectFire;
  if (ok) pass++; else { fail++; failed.push(q); }
  const rs = retrieveTopScore(q).toFixed(3);
  const rule = ruleInterpret(q).calls.length;
  console.log(`${ok ? 'OK ' : 'XX '} fire=${fired?1:0} exp=${expectFire?1:0} rule=${rule} rs=${rs}  "${q}"  -> ${JSON.stringify(gated.map(c=>c.name))}`);
}

// Explicit false-emergency assertion
const fe = _gateCalls('what a beautiful day out here', [C('dial_emergency')]);
console.log('\nFALSE-EMERGENCY on chit-chat -> ' + (fe.length === 0 ? 'SUPPRESSED (PASS)' : 'LEAKED (FAIL)'));
// Real emergency must still fire
const re = _gateCalls('SOS I broke my ankle', [C('dial_emergency')]);
console.log('REAL emergency "SOS I broke my ankle" -> ' + (re.length === 1 ? 'FIRES (PASS)' : 'BLOCKED (FAIL)'));

console.log(`\nGATE: ${pass}/${pass + fail} correct` + (failed.length ? '  FAILED: ' + JSON.stringify(failed) : ''));
process.exit(fail === 0 && fe.length === 0 && re.length === 1 ? 0 : 1);
