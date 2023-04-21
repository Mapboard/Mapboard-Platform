import * as path from "path";
import fs from "fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  fs.readFileSync("./web-components/package.json", "utf-8")
);

// Web components aliases
let aliases = [];
for (const [key, value] of Object.entries(pkg.alias)) {
  const root = path.resolve(__dirname, path.join("web-components", value));

  aliases.push({
    find: new RegExp(`^${key}$`),
    replacement: root,
  });
}

export default defineConfig({
  cacheDir: ".vite",
  resolve: {
    conditions: ["typescript"],
    alias: [
      { find: "~", replacement: path.resolve(__dirname, "src") },
      ...aliases,
    ],
  },
});
