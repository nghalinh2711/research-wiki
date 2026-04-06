import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Copilot SDK spawns and communicates with the Copilot CLI subprocess
  // via require.resolve.paths(). If Next.js bundles the SDK, that path
  // resolution breaks. Marking it external preserves the correct Node.js
  // module resolution context.
  serverExternalPackages: ["@github/copilot-sdk", "@github/copilot"],
};

export default nextConfig;
