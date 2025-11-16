// Polyfill for process.env

function getEnvVar(
  name: string,
  defaultValue: string | undefined = undefined,
): string {
  /** Get an environment variable from the Vite or Node.js environment,
   * in a cross-platform way.
   */
  if (import.meta.env && import.meta.env[name] !== undefined) {
    return import.meta.env[name];
  }
  if (process.env && process.env[name] !== undefined) {
    return process.env[name];
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  // Runtime environment (in browser, if defined)
  if (typeof window !== "undefined" && (window as any).env?.[name]) {
    return (window as any).env[name];
  }

  throw new Error(`Environment variable ${name} is not defined`);
}

export const apiDomain = getEnvVar("VITE_MAPBOARD_API_DOMAIN");
export const apiBasePath = "/pg-api";
export const apiBaseURL = `${apiDomain}${apiBasePath}`;

export const mapboxToken = getEnvVar("VITE_MAPBOX_TOKEN");
