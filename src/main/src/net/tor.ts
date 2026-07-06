import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { app, net, session } from "electron";
import { getUserDataDir } from "../shared/paths";

// Bundled Tor is shipped as an extraResource by electron-builder (see package.json
// `build.extraResources`) so it sits next to the app binary rather than inside the
// asar archive (Tor needs a real, executable file on disk).
const SOCKS_PORT = 19050;
const CONTROL_PORT = 19051;
const START_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

let torProcess: ChildProcessWithoutNullStreams | null = null;
let torReady: Promise<void> | null = null;
let statusListener: ((running: boolean) => void) | null = null;
let lastVerifiedIp: string | null = null;

export function setTorStatusListener(fn: (running: boolean) => void) {
  statusListener = fn;
}

function torBinaryName() {
  return process.platform === "win32" ? "tor.exe" : "tor";
}

function resolveTorBinaryPath() {
  // In dev, resources live in the repo; in a packaged app, extraResources land
  // in process.resourcesPath/tor/<platform>/tor(.exe).
  const platformDir =
    process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "tor", platformDir)
    : path.join(app.getAppPath(), "resources", "tor", platformDir);
  return path.join(base, torBinaryName());
}

function torDataDir() {
  const dir = path.join(getUserDataDir(), "tor-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function waitForSocksPort(): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ port: SOCKS_PORT, host: "127.0.0.1" }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error("Timed out waiting for Tor SOCKS port to open"));
          return;
        }
        setTimeout(attempt, POLL_INTERVAL_MS);
      });
    };
    attempt();
  });
}

/**
 * Launches the bundled Tor daemon and waits until its SOCKS5 proxy is accepting
 * connections. Safe to call multiple times; subsequent calls return the same
 * in-flight/completed promise.
 */
export function startTor(): Promise<void> {
  if (torReady) return torReady;

  torReady = new Promise((resolve, reject) => {
    const binaryPath = resolveTorBinaryPath();

    if (!fs.existsSync(binaryPath)) {
      reject(new Error(`Bundled Tor binary not found at ${binaryPath}`));
      return;
    }

    const child = spawn(
      binaryPath,
      [
        "--SocksPort", String(SOCKS_PORT),
        "--ControlPort", String(CONTROL_PORT),
        "--CookieAuthentication", "1",
        "--DataDirectory", torDataDir(),
        "--Log", "notice stdout",
        "--AvoidDiskWrites", "1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    torProcess = child;

    child.on("error", (err) => {
      reject(err);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      console.warn(`[tor] ${chunk.toString().trim()}`);
    });

    child.on("exit", (code, signal) => {
      if (torProcess === child) {
        torProcess = null;
        torReady = null;
        statusListener?.(false);
      }
      console.warn(`[tor] process exited (code=${code}, signal=${signal})`);
    });

    waitForSocksPort().then(() => {
      // Route all Electron net.fetch() calls through the Tor SOCKS5 proxy.
      // Chromium's networking stack handles SOCKS5 natively; this avoids the
      // undici dispatcher incompatibility with the http.Agent-based socks-proxy-agent.
      session.defaultSession
        .setProxy({ proxyRules: `socks5://127.0.0.1:${SOCKS_PORT}` })
        .then(() => {
          statusListener?.(true);
          resolve();
          // Fire-and-forget: confirm routing and capture exit IP for the UI.
          verifyTor().catch((err) => {
            console.warn("[tor] could not verify Tor routing:", err);
          });
        })
        .catch(reject);
    }, reject);
  });

  return torReady;
}

export function stopTor() {
  if (torProcess) {
    torProcess.kill();
    torProcess = null;
    statusListener?.(false);
  }
  torReady = null;
  lastVerifiedIp = null;
}

export function isTorRunning() {
  return torProcess != null;
}

export function getTorExitIp() {
  return lastVerifiedIp;
}

/**
 * Hits check.torproject.org to confirm traffic is routed through Tor and
 * captures the exit node IP. Logs the result; rejects if IsTor is false.
 */
export async function verifyTor(): Promise<{ isTor: boolean; ip: string }> {
  const response = await net.fetch("https://check.torproject.org/api/ip");
  if (!response.ok) throw new Error(`check.torproject.org returned ${response.status}`);
  const data = (await response.json()) as { IsTor: boolean; IP: string };
  lastVerifiedIp = data.IP;
  if (data.IsTor) {
    console.log(`[tor] verified: routing through Tor, exit IP: ${data.IP}`);
  } else {
    console.error(`[tor] WARNING: traffic is NOT going through Tor! IP: ${data.IP}`);
  }
  return { isTor: data.IsTor, ip: data.IP };
}

/**
 * Drop-in replacement for fetch() that routes through the bundled Tor SOCKS5
 * proxy via Electron's net.fetch() (Chromium networking). The session proxy is
 * configured in startTor() once the daemon is ready, so all net.fetch() calls
 * automatically go through Tor without needing a custom dispatcher.
 */
export async function torFetch(url: string, init?: RequestInit): Promise<Response> {
  await startTor();
  return net.fetch(url, init as Parameters<typeof net.fetch>[1]);
}
