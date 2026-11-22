/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    "@indoor-o-route-analysis/core",
    "@indoor-o-route-analysis/ui",
  ],
};

export default nextConfig;
