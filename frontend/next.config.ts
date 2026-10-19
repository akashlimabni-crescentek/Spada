import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and some clients hit 127.0.0.1 while `next dev` advertises localhost.
  // Without this, Next 16 blocks /_next chunks and the app never hydrates past SSR.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
