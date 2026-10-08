import type { NextConfig } from "next";

// The browser only talks to this origin: /api/* is proxied to FastAPI, so there is no CORS to configure.
const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};

export default config;
