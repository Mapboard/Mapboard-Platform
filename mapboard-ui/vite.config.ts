import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import path from "node:path";

export default defineConfig({
  plugins: [vike({}), react({})],
  resolve: {
    alias: {
      "~": path.resolve("./shared"),
    },
  },
});
