/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in builds that include personal modules from src/personal; set in .env.local. */
  readonly VITE_PERSONAL?: string;
}
