// Minimal no-op mock so app tests don’t try to boot the embedded Node runtime
const channel = {
  send: () => {},
  addListener: () => ({ remove: () => {} }),
  removeAllListeners: () => {},
};

export default {
  start: () => {},
  channel,
};
