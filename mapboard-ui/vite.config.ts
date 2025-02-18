import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import path from "node:path";
import hyperStyles from "@macrostrat/vite-plugin-hyperstyles";

export default defineConfig({
  plugins: [vike({}), react({}), hyperStyles()],
  resolve: {
    conditions: ["source"],
    dedupe: [
      "react",
      "react-dom",
      "@macrostrat/map-interface",
      "@macrostrat/mapbox-react",
    ],
    alias: {
      "~": path.resolve("./shared"),
    },
  },
  ssr: {
    noExternal: [
      /** All dependencies that cannot be bundled on the server (e.g., due to CSS imports)
       * should be listed here.
       */
      "@macrostrat/form-components",
      "@macrostrat/ui-components",
      "@macrostrat/column-components",
      "@macrostrat/column-views",
      "@macrostrat/data-components",
      "@macrostrat/svg-map-components",
      "@macrostrat/map-interface",
      "@macrostrat/feedback-components",
      "@macrostrat/timescale",
      "@macrostrat/mapbox-react",
    ],
  },
  server: {
    port: 3002,
  },
});
