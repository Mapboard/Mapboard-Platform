import * as path from "path";
import fs from "fs";

const pkg = JSON.parse(
  fs.readFileSync("./web-components/package.json", "utf-8")
);

// Web components aliases
let aliases = [];
for (const [key, value] of Object.entries(pkg.alias)) {
  const name = key.replace("@macrostrat/", "");
  const root = path.resolve(
    __dirname,
    path.join("web-components", "packages", name, "src")
  );
  aliases.push({
    find: key + "/src",
    replacement: root,
  });
  aliases.push({
    find: new RegExp(`^${key}$`),
    replacement: root + "/index.ts",
  });
}

export default {
  cacheDir: ".vite",
  resolve: {
    conditions: ["typescript"],
    alias: [
      { find: "~", replacement: path.resolve(__dirname, "src") },
      ...aliases,
    ],
  },
};
