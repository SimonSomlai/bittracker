const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager, outDir } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const signingIdentity = process.env.CSC_NAME || process.env.CSC_LINK || "";

  if (!fs.existsSync(appPath)) {
    throw new Error(`Expected app bundle at ${appPath}`);
  }

  if (!signingIdentity) {
    console.warn("Skipping post-signing for macOS because no signing identity was provided.");
    return;
  }

  const entitlementsPath = path.join(__dirname, "..", "resources", "entitlements.mac.plist");

  // Use a minimal signing argument set for inner binaries (no entitlements).
  const signingArgsBinary = [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signingIdentity,
  ];

  // Use entitlements for the main executable and bundle signing.
  const signingArgsEntitled = [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signingIdentity,
    "--entitlements",
    entitlementsPath,
  ];

  const mainExe = path.join(appPath, "Contents", "MacOS", appName);
  if (fs.existsSync(mainExe)) {
    execFileSync("codesign", [...signingArgsEntitled, mainExe], { stdio: "inherit" });
  }

  const torResourcesDir = path.join(appPath, "Contents", "Resources", "tor", "mac");
  if (fs.existsSync(torResourcesDir)) {
    for (const entry of fs.readdirSync(torResourcesDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const target = path.join(torResourcesDir, entry.name);
      if (entry.name.endsWith(".tar.gz")) {
        continue;
      }

      // Sign inner helper binaries and dylibs without entitlements.
      execFileSync("codesign", [...signingArgsBinary, target], { stdio: "inherit" });
    }
  }
  // Sign the top-level app bundle with entitlements.
  execFileSync("codesign", [...signingArgsEntitled, appPath], { stdio: "inherit" });
};
