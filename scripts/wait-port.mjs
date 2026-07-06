#!/usr/bin/env node
// Polls a TCP port until it accepts connections, then exits.
// Usage: node scripts/wait-port.mjs <port>
import { createConnection } from "node:net";

const port = Number(process.argv[2]);
if (!port) {
  console.error("Usage: wait-port.mjs <port>");
  process.exit(1);
}

function probe() {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort() {
  while (!(await probe())) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

await waitForPort();
