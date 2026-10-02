import path from "node:path";

export interface ServerConfig {
  selfHostedUrl: string;
  publicUrl: string;
  /** Directory for server-side JSON caches (gitignored). */
  cacheDir: string;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    selfHostedUrl: env.OPENF1_SELF_HOSTED_URL || "http://127.0.0.1:8000",
    publicUrl: env.OPENF1_PUBLIC_URL || "https://api.openf1.org",
    cacheDir: env.F1_CACHE_DIR || path.join(process.cwd(), ".cache"),
  };
}
