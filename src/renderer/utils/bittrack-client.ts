export function getBittrackApi() {
  if (!window.bittrack) {
    throw new Error("Bittrack API is not available");
  }
  return window.bittrack;
}
