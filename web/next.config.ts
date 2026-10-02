import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not (re)generate AGENTS.md / CLAUDE.md on `next dev`.
  agentRules: false,
};

export default nextConfig;
