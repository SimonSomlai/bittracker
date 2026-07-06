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

  const signingArgs = [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signingIdentity,
    "--entitlements",
    path.join(__dirname, "..", "resources", "entitlements.mac.plist"),
    "--entitlements-inherit",
    path.join(__dirname, "..", "resources", "entitlements.mac.plist"),
  ];

  const targets = [path.join(appPath, "Contents", "MacOS", appName)];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      execFileSync("codesign", [...signingArgs, target], { stdio: "inherit" });
    }
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

      execFileSync("codesign", [...signingArgs, target], { stdio: "inherit" });
    }
  }

  execFileSync("codesign", [...signingArgs, appPath], { stdio: "inherit" });

  if (fs.existsSync(path.join(outDir, `${appName}.dmg`))) {
    const dmgPath = path.join(outDir, `${appName}.dmg`);
    execFileSync("codesign", [...signingArgs, dmgPath], { stdio: "inherit" });
  }
};
