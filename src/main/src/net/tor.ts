import { spawn, execSync, ChildProcessWithoutNullStreams } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { app, net, session } from "electron";
import { getUserDataDir } from "../shared/paths";

const SOCKS_PORT = 19050;
const CONTROL_PORT = 19051;
const START_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;
const MAX_RESTART_ATTEMPTS = 4;
const RESTART_BASE_DELAY_MS = 1_500;
const STABLE_RUN_MS = 60_000;

let torProcess: ChildProcessWithoutNullStreams | null = null;
let torReady: Promise<void> | null = null;
let statusListener: ((running: boolean) => void) | null = null;
let lastVerifiedIp: string | null = null;
let intentionalStop = false;
let restartAttempts = 0;
let torStartedAt = 0;

export function setTorStatusListener(fn: (running: boolean) => void) {
  statusListener = fn;
}

function killExistingTorInstances() {
  try {
    if (process.platform === "win32") {
      execSync(
        `for /f "tokens=5" %a in ('netstat -aon ^| findstr ":${SOCKS_PORT} "') do taskkill /F /PID %a`,
        { stdio: "ignore", shell: true },
      );
    } else {
      execSync(`lsof -ti tcp:${SOCKS_PORT} -ti tcp:${CONTROL_PORT} | xargs kill -9`, {
        stdio: "ignore",
        shell: true,
      });
    }
  } catch {
    // nothing to kill
  }
}

function resolveTorBinaryPath() {
  const isWin = process.platform === "win32";
  if (!isWin && process.platform !== "darwin")
    throw new Error(`Unsupported platform: ${process.platform}`);
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "tor", isWin ? "win32" : "darwin")
    : path.join(app.getAppPath(), "resources", "tor", isWin ? "win32" : "darwin");
  return path.join(base, isWin ? "tor.exe" : "tor");
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
          reject(new Error("Timed out waiting for Tor SOCKS port"));
          return;
        }
        setTimeout(attempt, POLL_INTERVAL_MS);
      });
    };
    attempt();
  });
}

export function startTor(): Promise<void> {
  if (torReady) return torReady;
  if (restartAttempts === 0) killExistingTorInstances();

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
    child.on("error", reject);
    child.stdout.on("data", (c: Buffer) => console.log(`[tor] ${c.toString().trim()}`));
    child.stderr.on("data", (c: Buffer) => console.warn(`[tor] ${c.toString().trim()}`));

    child.on("exit", (code, signal) => {
      console.warn(`[tor] process exited (code=${code}, signal=${signal})`);
      if (torProcess !== child) return;
      torProcess = null;
      torReady = null;

      if (intentionalStop) {
        intentionalStop = false;
        restartAttempts = 0;
        statusListener?.(false);
        return;
      }

      if (torStartedAt > 0 && Date.now() - torStartedAt > STABLE_RUN_MS) restartAttempts = 0;

      if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        console.error("[tor] max restart attempts reached, giving up");
        restartAttempts = 0;
        statusListener?.(false);
        return;
      }

      const delay = RESTART_BASE_DELAY_MS * Math.pow(2, restartAttempts++);
      console.warn(`[tor] restarting (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}) in ${delay}ms…`);
      setTimeout(() => {
        startTor().catch((err) => {
          console.error("[tor] failed to restart:", err);
          statusListener?.(false);
        });
      }, delay);
    });

    waitForSocksPort()
      .then(() => session.defaultSession.setProxy({ proxyRules: `socks5://127.0.0.1:${SOCKS_PORT}` }))
      .then(() => verifyTor())
      .then(() => {
        torStartedAt = Date.now();
        statusListener?.(true);
        resolve();
      })
      .catch((err) => {
        torReady = null;
        reject(err);
      });
  });

  return torReady;
}

export function stopTor() {
  intentionalStop = true;
  torProcess?.kill();
  torProcess = null;
  torReady = null;
  lastVerifiedIp = null;
  statusListener?.(false);
}

export function isTorRunning() {
  return torProcess != null;
}

export function getTorExitIp() {
  return lastVerifiedIp;
}

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

export async function torFetch(url: string, init?: RequestInit): Promise<Response> {
  await startTor();
  return net.fetch(url, init as Parameters<typeof net.fetch>[1]);
}
