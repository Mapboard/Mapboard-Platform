import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import path from "node:path";
import hyperStyles from "@macrostrat/vite-plugin-hyperstyles";

export default defineConfig({
  plugins: [vike({}), react({}), hyperStyles()],
  resolve: {
    alias: {
      "~": path.resolve("./shared"),
    },
  },
  ssr: {
    noExternal: ["@macrostrat/ui-components"],
  },
  server: {
    port: 3002,
  },
});
