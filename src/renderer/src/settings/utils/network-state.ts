const DEFAULT_EXPLORER_WEB_URL = "https://blockstream.info";

let explorerWebUrl =
  typeof window !== "undefined" && window.bittrack?.explorerWebUrl
    ? window.bittrack.explorerWebUrl
    : DEFAULT_EXPLORER_WEB_URL;

export function setExplorerWebUrl(url: string) {
  explorerWebUrl = url;
}

export function getExplorerWebUrl() {
  return explorerWebUrl;
}
