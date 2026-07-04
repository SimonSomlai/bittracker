export interface BuildInfo {
  version: string;
  commit: string;
  commitFull: string;
  repositoryUrl: string | null;
  builtAt: string;
}

const DEV_BUILD_INFO: BuildInfo = {
  version: "0.0.0-dev",
  commit: "dev",
  commitFull: "dev",
  repositoryUrl: null,
  builtAt: new Date(0).toISOString(),
};

function parseBuildInfo(): BuildInfo {
  const raw = import.meta.env.VITE_BUILD_INFO as unknown;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as BuildInfo;
    } catch {
      return DEV_BUILD_INFO;
    }
  }
  if (raw && typeof raw === "object") {
    return raw as BuildInfo;
  }
  return DEV_BUILD_INFO;
}

export const BUILD_INFO = parseBuildInfo();

export function buildCommitUrl(info: BuildInfo): string | null {
  if (!info.repositoryUrl || info.commitFull === "dev") return null;
  return `${info.repositoryUrl}/commit/${info.commitFull}`;
}

export function buildReleaseUrl(info: BuildInfo): string | null {
  if (!info.repositoryUrl || info.version === "0.0.0-dev") return null;
  return `${info.repositoryUrl}/releases/tag/v${info.version}`;
}

export function buildTagSourceUrl(info: BuildInfo): string | null {
  if (!info.repositoryUrl || info.version === "0.0.0-dev") return null;
  return `${info.repositoryUrl}/tree/v${info.version}`;
}
