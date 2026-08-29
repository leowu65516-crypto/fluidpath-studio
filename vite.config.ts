import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5210 },
  test: {
    environment: "jsdom",
    globals: true,
    // CI（慢机器/多 worker 抢占）下重型渲染与大图基准可能超过默认 5s，放宽到 30s 只防真正挂起
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
});
