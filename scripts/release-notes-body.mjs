import { readBuildInfo } from "./build-info.mjs";

const info = readBuildInfo();
const repo = info.repositoryUrl ?? "https://github.com/YOUR_ORG/bittrack";
const tag = `v${info.version}`;
const commitUrl = `${repo}/commit/${info.commitFull}`;
const releaseUrl = `${repo}/releases/tag/${tag}`;

process.stdout.write(`## BitTracker ${info.version}

Built from [\`${info.commit}\`](${commitUrl}) on ${info.builtAt.slice(0, 10)}.

### Verify your download

1. Download \`BitTracker-${info.version}.dmg\` (macOS) and/or \`BitTracker-${info.version}.exe\` (Windows) from [this release](${releaseUrl}) — not from third-party mirrors.
2. Check the SHA-256 hash:
   \`\`\`bash
   shasum -a 256 BitTracker-${info.version}.dmg
   \`\`\`
   Compare with \`SHA256SUMS\` attached to this release.
3. Check the footer (bottom right) shows **v${info.version} · ${info.commit}**.
4. Compare that commit with the tag source on GitHub: [${tag}](${repo}/tree/${tag}).

### Verify macOS code signature

macOS builds are signed with **Developer ID Application: Somlai Simon** (Team ID **M6349D88KR**) and notarized by Apple.

\`\`\`bash
# After mounting the DMG
codesign -dv --verbose=4 /Volumes/BitTracker*/BitTracker.app
spctl -a -vv -t install ~/Downloads/BitTracker-${info.version}.dmg
\`\`\`

Look for \`TeamIdentifier=M6349D88KR\` in the output.

### What this proves

- The file you downloaded is the one Github CI built in this release.
- The app reports the same git commit as the release tag.
- macOS Gatekeeper accepts the signed, notarized build connected to my Apple Developer account.

We do **not** claim byte-for-byte reproducible builds from source. For this, building from source is always available.
`);
