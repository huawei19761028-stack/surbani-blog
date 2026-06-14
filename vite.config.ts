import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api 요청은 Express 프록시 서버(3001)로 전달한다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
