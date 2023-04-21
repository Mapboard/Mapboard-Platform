import * as path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  cacheDir: ".vite",
  resolve: {
    conditions: ["typescript"],
    alias: [{ find: "~", replacement: path.resolve(__dirname, "src") }],
  },
});
