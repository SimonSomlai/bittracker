/**
 * Main/preload are bundled with esbuild. Only packages that cannot be bundled
 * (native addons, WASM, Electron, Trezor Connect in a child process) stay external.
 *
 * This is the standard Electron pattern (same idea as electron-vite / electron-forge):
 * bundle application JS; ship native modules via electron-builder.
 */
export const electronExternals = [
  "electron",
  "argon2",
  "better-sqlite3-multiple-ciphers",
  "@ledgerhq/hw-transport-node-hid",
  "@ledgerhq/hw-app-btc",
  "@trezor/connect",
  "bip32",
  "tiny-secp256k1",
  "usb",
];
