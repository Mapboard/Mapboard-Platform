import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import vike from "vike/plugin";
import path from "node:path";

/** Since we are running on a self-signed certificate in development,
 * we need to disable TLS checks.
 */
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

export default defineConfig({
  plugins: [vike({}), react({})],
  build: {
    target: "es2022"
  },
  resolve: {
    alias: {
      "~": path.resolve("./shared")
    }
  },
  ssr: {
    noExternal: [
      /** All dependencies that cannot be bundled on the server (e.g., due to CSS imports)
       * should be listed here.
       */
      "@macrostrat/ui-components"
    ]
  },
  server: {
    port: 3002,
    allowedHosts: [
      "localhost",
      // For local development
      "mapboard.local"
    ],
    watch: {
      // We reload .env files using Nodemon when in development
      ignored: [".env"]
    }
  }
});
