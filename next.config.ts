import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow server actions to run longer for the worker cron endpoint
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
