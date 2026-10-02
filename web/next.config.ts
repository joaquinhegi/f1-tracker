import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not (re)generate AGENTS.md / CLAUDE.md on `next dev`.
  agentRules: false,
  // Bundles only the traced server + deps for the production container image.
  output: "standalone",
};

export default nextConfig;
