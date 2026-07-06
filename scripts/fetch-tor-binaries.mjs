/**
 * Downloads the official Tor Expert Bundle for each target platform and stages
 * the `tor` binary (and its required shared libraries) under resources/tor/<os>/
 * so electron-builder can ship them as extraResources (see package.json
 * build.extraResources).
 *
 * Binaries are fetched from the Tor Project's own distribution (dist.torproject.org)
 * and checked against the sha256sums file that the Tor Project GPG-signs, so a
 * compromised CDN/mirror can't silently swap the binary without detection.
 *
 * Run manually or in CI before `pnpm dist` / release:
 *   node scripts/fetch-tor-binaries.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Pinned version + expected sha256 of each archive. Bump deliberately; never
// fetch a "latest" pointer for a security-relevant binary.
const TOR_VERSION = "15.0.17";
const BASE_URL = `https://dist.torproject.org/torbrowser/${TOR_VERSION}`;

const TARGETS = [
  {
    os: "mac",
    archive: `tor-expert-bundle-macos-x86_64-${TOR_VERSION}.tar.gz`,
    sha256: "95243f76bcf05d6179d017c3f3e4ece7b53cc58dff1ba617b03a2fe2c8298b5b",
    // All files to extract from the archive (relative to the archive root).
    // The tor binary links libevent via @executable_path so it must sit next to it.
    extract: ["tor/tor", "tor/libevent-2.1.7.dylib"],
    executable: ["tor/tor"],
  },
  {
    os: "win",
    archive: `tor-expert-bundle-windows-x86_64-${TOR_VERSION}.tar.gz`,
    sha256: "5f91e9426bf641dfe539dc28029088c72bed0b1d8f1c79104a0f89273cb3ebe1",
    extract: ["tor/tor.exe"],
    executable: [],
  },
  {
    os: "linux",
    archive: `tor-expert-bundle-linux-x86_64-${TOR_VERSION}.tar.gz`,
    sha256: "4621e1573dbd6d5d6f4bb4121b37652a8b7204ae5abea600fb6b9e05e5695696",
    extract: ["tor/tor", "tor/libcrypto.so.3", "tor/libevent-2.1.so.7", "tor/libssl.so.3"],
    executable: ["tor/tor"],
  },
];

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  for (const target of TARGETS) {
    if (target.sha256.startsWith("REPLACE_WITH")) {
      console.error(
        `[fetch-tor-binaries] Refusing to fetch ${target.os}: no pinned sha256 set for ` +
          `${target.archive}. Verify the checksum against the Tor Project's signed ` +
          `sha256sums-unsigned/sha256sums.asc for version ${TOR_VERSION} and hardcode it ` +
          `in this script before running.`,
      );
      process.exitCode = 1;
      continue;
    }

    const url = `${BASE_URL}/${target.archive}`;
    console.log(`[fetch-tor-binaries] Downloading ${url}`);
    const archiveBuffer = await download(url);

    const actualHash = sha256(archiveBuffer);
    if (actualHash !== target.sha256) {
      throw new Error(
        `Checksum mismatch for ${target.archive}: expected ${target.sha256}, got ${actualHash}. ` +
          `Aborting — do not package an unverified Tor binary.`,
      );
    }

    const outDir = path.join(root, "resources", "tor", target.os);
    fs.mkdirSync(outDir, { recursive: true });
    const archivePath = path.join(outDir, target.archive);
    fs.writeFileSync(archivePath, archiveBuffer);

    // Extract each required file, stripping the leading "tor/" path component
    // so everything lands flat in outDir next to the binary.
    const result = spawnSync(
      "tar",
      ["-xzf", archivePath, "-C", outDir, "--strip-components=1", ...target.extract],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error(`tar extraction failed for ${target.os}`);
    }

    // Mark executables
    for (const entry of target.executable) {
      const filename = path.basename(entry);
      fs.chmodSync(path.join(outDir, filename), 0o755);
    }

    console.log(`[fetch-tor-binaries] ${target.os}: extracted ${target.extract.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
