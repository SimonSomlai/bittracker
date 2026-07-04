import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function readPackageVersion(rootDir) {
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.version ?? "0.0.0";
}

function readRepositoryUrl(rootDir) {
  if (process.env.GITHUB_REPOSITORY) {
    return `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  }

  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const repo = pkg.repository;

  if (typeof repo === "string") {
    return repo.replace(/^git\+/, "").replace(/\.git$/, "");
  }
  if (repo?.url) {
    return repo.url.replace(/^git\+/, "").replace(/\.git$/, "");
  }

  return null;
}

function readGitCommit(rootDir) {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.trim();
  }

  try {
    return execSync("git rev-parse HEAD", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

export function readBuildInfo(rootDir = process.cwd()) {
  const version = readPackageVersion(rootDir);
  const commitFull = readGitCommit(rootDir);
  const commit = commitFull === "dev" ? "dev" : commitFull.slice(0, 7);

  return {
    version,
    commit,
    commitFull,
    repositoryUrl: readRepositoryUrl(rootDir),
    builtAt: new Date().toISOString(),
  };
}
