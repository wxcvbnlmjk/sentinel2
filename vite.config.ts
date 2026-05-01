import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      "/__cdse_token": {
        target: "https://identity.dataspace.copernicus.eu",
        changeOrigin: true,
        rewrite: () => "/auth/realms/CDSE/protocol/openid-connect/token",
      },
      "/__cdse_sh": {
        target: "https://sh.dataspace.copernicus.eu",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__cdse_sh/, ""),
      },
    },
  },
  preview: {
    host: true,
  },
});
