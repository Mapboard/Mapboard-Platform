import "dotenv/config";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { vikeHandler } from "./vike-handler";
import { createHandler } from "@universal-middleware/express";
import express from "express";
import { createDevMiddleware } from "vike/server";
import stylesRouter, { geologicPatternsBasePath } from "./styles/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(join(__dirname, ".."));
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const hmrPort = process.env.HMR_PORT
  ? parseInt(process.env.HMR_PORT, 10)
  : 24680;
const hmrHost = process.env.HMR_HOST ?? "localhost";
const hmrProtocol = process.env.HMR_PROTOCOL ?? "ws";

const hmr = {
  host: hmrHost,
  port: hmrPort,
  protocol: hmrProtocol,
};

export default (await startServer()) as unknown;

async function startServer() {
  const app = express();

  app.use(
    "/assets/geologic-patterns",
    express.static(geologicPatternsBasePath),
  );
  app.use("/styles", stylesRouter);

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(`${root}/dist/client`));
  } else {
    // Instantiate Vite's development server and integrate its middleware to our server.
    // ⚠️ We should instantiate it *only* in development. (It isn't needed in production
    // and would unnecessarily bloat our server in production.)
    const { devMiddleware } = await createDevMiddleware({
      root,
      viteConfig: {
        server: { hmr },
      },
    });
    app.use(devMiddleware);
  }

  /*
   * Vike route
   *
   * @link {@see https://vike.dev}
   **/
  app.all("*", createHandler(vikeHandler)());

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });

  return app;
}
