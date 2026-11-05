import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esconde o ícone "N" do Next no canto da tela durante o npm run dev
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
