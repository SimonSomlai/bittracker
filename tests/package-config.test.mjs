import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

test("mac packaging signs bundled Tor binaries and excludes tar archives from extra resources", () => {
  assert.equal(pkg.build.afterSign, "scripts/after-sign.cjs");

  const extraResource = pkg.build.extraResources?.[0];
  assert.ok(extraResource, "expected an extraResources entry for bundled Tor files");
  assert.ok(
    extraResource.filter.includes("!**/*.tar.gz"),
    "expected tor tar archives to be excluded from the mac app bundle",
  );

  assert.equal(pkg.build.mac.hardenedRuntime, true);
  assert.equal(pkg.build.mac.entitlements, "resources/entitlements.mac.plist");
  assert.equal(pkg.build.mac.entitlementsInherit, "resources/entitlements.mac.plist");
});
