import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { buildGraphPlugin } from "./scripts/buildGraphPlugin.ts";

export default defineConfig(({ command, mode }) => {
  const explicitMock = mode === "mock";
  const mockModule = command !== "build" || explicitMock ? "./src/services/api/mockEntry.ts" : "./src/config/mockUnavailable.ts";
  return {
    plugins: [react(), buildGraphPlugin(explicitMock ? "mock" : "backend")],
    resolve: { alias: { "@dispatch-mock-entry": fileURLToPath(new URL(mockModule, import.meta.url)) } },
    ...(explicitMock ? { define: { "import.meta.env.VITE_DISPATCH_MODE": JSON.stringify("mock") } } : {}),
    test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], css: true, exclude: ["**/node_modules/**", "**/scripts/audit-backend-build.check.mjs"] }
  };
});
