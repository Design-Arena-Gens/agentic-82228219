import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    agent: "src/cli/index.ts"
  },
  format: ["cjs"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node"
  },
  outExtension() {
    return {
      js: ".cjs"
    };
  }
});
