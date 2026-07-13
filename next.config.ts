import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static build so the app can be hosted on GitHub Pages.
  output: "export",
  trailingSlash: true,
  // Set to "/cpa" in CI so assets resolve under https://<user>.github.io/cpa/
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: { unoptimized: true },
};

export default nextConfig;
