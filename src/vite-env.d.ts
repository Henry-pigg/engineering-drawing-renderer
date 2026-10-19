/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 识别服务地址；留空则使用内置 mock，便于无后端时演示 */
  readonly VITE_RECOGNIZE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
