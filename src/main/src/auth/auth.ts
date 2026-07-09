import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { lockDatabase } from "./db";
import { clearMarketDataCache } from "../market/store";
import { clearPreferencesCache } from "../settings/preferences";
import { setRuntimeNetwork } from "../settings/network-env-core";
import { getUserDataDirsForReset, getUserDataDir, wipeUserDataDir } from "../shared/paths";

const META_FILE = "meta.json";

interface AuthMeta {
  passwordHash: string;
  dbKeySalt: string;
}

function getMetaPath() {
  return path.join(getUserDataDir(), META_FILE);
}

export function getDbPath() {
  return path.join(getUserDataDir(), "bittrack.db");
}

export function generatePassword(length = 20): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export function isInitialized() {
  return fs.existsSync(getMetaPath());
}

function readMeta(): AuthMeta {
  return JSON.parse(fs.readFileSync(getMetaPath(), "utf8")) as AuthMeta;
}

function writeMeta(meta: AuthMeta) {
  fs.writeFileSync(getMetaPath(), JSON.stringify(meta));
}

export async function setupPassword(password: string) {
  if (isInitialized()) {
    throw new Error("App is already initialized");
  }
  fs.mkdirSync(getUserDataDir(), { recursive: true });
  const passwordHash = await argon2.hash(password);
  const dbKeySalt = randomBytes(32).toString("hex");
  writeMeta({ passwordHash, dbKeySalt });
}

export async function verifyPassword(password: string) {
  if (!isInitialized()) return false;
  const meta = readMeta();
  return argon2.verify(meta.passwordHash, password);
}

function resolveDbKeySalt(meta: AuthMeta) {
  if (!meta.dbKeySalt) {
    throw new Error("Invalid authentication metadata");
  }
  return Buffer.from(meta.dbKeySalt, "hex");
}

export async function deriveDbKey(password: string) {
  if (!isInitialized()) {
    throw new Error("App is not initialized");
  }

  const meta = readMeta();
  const salt = resolveDbKeySalt(meta);
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    salt,
    hashLength: 32,
    raw: true,
    memoryCost: 46080,
    timeCost: 3,
    parallelism: 1,
  });
  return Buffer.from(hash).toString("hex");
}

export function resetAppData() {
  clearMarketDataCache();
  clearPreferencesCache();
  setRuntimeNetwork(null);
  lockDatabase();

  for (const dir of getUserDataDirsForReset()) {
    wipeUserDataDir(dir);
  }
}
