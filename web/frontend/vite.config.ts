import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const backendUrl = process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const publicOnly = process.env.VITE_PUBLIC_ONLY === "true";
let publicHost: string | undefined;
try {
  publicHost = process.env.VITE_PUBLIC_BASE_URL
    ? new URL(process.env.VITE_PUBLIC_BASE_URL).hostname
    : undefined;
} catch {
  publicHost = undefined;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "participant-only-routes",
      configureServer(server) {
        if (!publicOnly) return;
        server.middlewares.use((request, response, next) => {
          const path = (request.url || "").split("?")[0];
          if (
            (path === "/api" ||
              path.startsWith("/api/") ||
              path === "/output" ||
              path.startsWith("/output/") ||
              path === "/maps" ||
              path.startsWith("/maps/") ||
              path === "/docs" ||
              path === "/openapi.json" ||
              path === "/redoc") &&
            !/^\/api\/participate\/(?:start|[^/]+(?:\/submit|\/steps\/\d+\/(?:confirm|draft))?)$/.test(
              path,
            )
          ) {
            response.statusCode = 404;
            response.end("Not Found");
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    fs: { allow: [fileURLToPath(new URL(".", import.meta.url))] },
    allowedHosts: publicOnly && publicHost ? [publicHost] : [],
    proxy: publicOnly
      ? {
          "/api/participate": { target: backendUrl, changeOrigin: false },
        }
      : {
          "/api": backendUrl,
          "/maps": backendUrl,
          "/output": backendUrl,
        },
  },
});
