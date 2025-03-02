import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import mdx from "@mdx-js/rollup";
import path from "node:path";

export default defineConfig({
  plugins: [vike(), react(), mdx()],
  build: {
    target: "es2022",
  },
  resolve: {
    alias: {
      "~": path.resolve("./shared"),
    },
  },
  ssr: {
    noExternal: [
      /** All dependencies that cannot be bundled on the server (e.g., due to CSS imports)
       * should be listed here.
       */
      "@macrostrat/ui-components",
    ],
  },
  server: {
    port: 3002,
    allowedHosts: [
      "localhost",
      // For local development
      "mapboard.local",
      "daven-quinn.local",
    ],
    watch: {
      // We reload .env files using Nodemon when in development
      ignored: [".env"],
    },
  },
  css: {
    preprocessorOptions: {
      sass: {
        /**
         https://github.com/vitejs/vite/issues/19052
         We need to use the legacy API to avoid a bug with
         tsx import resolution
         https://github.com/privatenumber/tsx/issues/442
         If this gets resolved we can switch back to the
         `sass-embedded` package
         */
        api: "modern-compiler",
      },
    },
  },
});
