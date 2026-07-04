import type { BittrackApi } from "@/utils/bittrack-api";

interface ImportMetaEnv {
  readonly VITE_BUILD_INFO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    bittrack?: BittrackApi;
  }
}

export {};
