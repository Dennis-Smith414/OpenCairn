const rn_bridge = require("rn-bridge");
console.log("[sidecar] hello from minimal sidecar");
rn_bridge.channel.send(JSON.stringify({ type: "hello", from: "node" }));
