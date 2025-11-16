/// <reference lib="webworker" />
import { renderPage } from "vike/server";
// TODO: stop using universal-middleware and directly integrate server middlewares instead. (Bati generates boilerplates that use universal-middleware https://github.com/magne4000/universal-middleware to make Bati's internal logic easier. This is temporary and will be removed soon.)
import type { Get, UniversalHandler } from "@universal-middleware/core";

export const vikeHandler: Get<[], UniversalHandler> =
  () => async (request, context, runtime) => {
    const pageContextInit = {
      ...context,
      ...runtime,
      // Added to allow runtime definition of environment variables
      environment: synthesizeConfigFromEnvironment(),
      urlOriginal: request.url,
      headersOriginal: request.headers,
    };
    const pageContext = await renderPage(pageContextInit);
    const response = pageContext.httpResponse;

    const { readable, writable } = new TransformStream();
    response.pipe(writable);

    return new Response(readable, {
      status: response.statusCode,
      headers: response.headers,
    });
  };

function synthesizeConfigFromEnvironment() {
  /** Creates a mapping of environment variables that start with VITE_,
   * and returns them as an object. This allows us to pass environment
   * variables to the client at runtime.
   *
   * TODO: Ideally this would be defined in a library.
   * */
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("VITE_")) {
      env[key] = value;
    }
  }
  return env;
}
