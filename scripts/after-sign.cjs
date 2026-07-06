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
  ];

  const torResourcesDir = path.join(appPath, "Contents", "Resources", "tor", "darwin");
  if (fs.existsSync(torResourcesDir)) {
    for (const entry of fs.readdirSync(torResourcesDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }

      const target = path.join(torResourcesDir, entry.name);

      execFileSync("codesign", [...signingArgs, target], { stdio: "inherit" });
    }
  }
};
