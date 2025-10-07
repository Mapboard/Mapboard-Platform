import { useMapState } from "./state";
import { useMemo } from "react";
import {
  isMapboxURL,
  transformMapboxUrl,
} from "maplibregl-mapbox-request-transformer";
import { mapboxToken } from "~/settings";

export function useRequestTransformer(
  transformMapboxRequests: boolean = false,
) {
  const baseLayers = useMapState((state) => state.baseLayers);
  const { token } = createSkuToken();

  // Check if there's a DEM layer in the base layers
  return useMemo(() => {
    const dem = baseLayers?.find((layer) => layer.type === "dem");

    if (dem == null || !transformMapboxRequests) {
      return null;
    }
    console.log("Using DEM layer for request transformation", dem);

    return (url, resourceType) => {
      let transformedURL = url;
      if (transformMapboxRequests) {
        console.log(url, resourceType);
        if (isMapboxURL(url)) {
          const res = transformMapboxUrl(url, resourceType, mapboxToken);
          transformedURL = res.url;

          // Add a sku token
          const [base, queryString] = transformedURL.split("?");
          const query = new URLSearchParams(queryString);
          query.set("sku", token);
          transformedURL = base + "?" + query.toString();
          console.log("Transformed Mapbox URL", transformedURL);
        }
      }

      /** Common API to use for transforming requests for caching or modifying */
      const tilesetID = "mapbox.mapbox-terrain-dem-v1";
      const fallbackLayer =
        "https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1";
      if (resourceType == "Tile" && transformedURL.includes(tilesetID)) {
        // We want to send this request to our elevation tiling backend, preserving query args
        const [baseURL, query, ...rest] = transformedURL.split("?");

        if (rest.length > 0) {
          console.warn(
            "Unexpected URL format, expected no additional path segments after query string",
            rest,
          );
        }

        let [start, ...rest1] = baseURL.split(tilesetID);
        console.log("baseURL", baseURL, start);
        if (start.endsWith("/")) {
          start = start.slice(0, -1);
        }

        // This depends on the "elevation-tiler" dependency
        let newURL = "/dem-tiles/tiles" + rest1[0];
        let queryArgs = new URLSearchParams(query);

        queryArgs.set("x-overlay-layer", dem.url);
        queryArgs.set("x-fallback-layer", fallbackLayer);
        queryArgs.set("sku", token);

        transformedURL = newURL + "?" + queryArgs.toString();
      }

      return { url: transformedURL };
    };
  }, [baseLayers, transformMapboxRequests]);
}

type SkuTokenObject = {
  token: string;
  tokenExpiresAt: number;
};

const SKU_ID = "01";

function createSkuToken(): SkuTokenObject {
  // SKU_ID and TOKEN_VERSION are specified by an internal schema and should not change
  const TOKEN_VERSION = "1";
  const base62chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  // sessionRandomizer is a randomized 10-digit base-62 number
  let sessionRandomizer = "";
  for (let i = 0; i < 10; i++) {
    sessionRandomizer += base62chars[Math.floor(Math.random() * 62)];
  }
  const expiration = 12 * 60 * 60 * 1000; // 12 hours
  const token = [TOKEN_VERSION, SKU_ID, sessionRandomizer].join("");
  const tokenExpiresAt = Date.now() + expiration;

  return { token, tokenExpiresAt };
}

export { createSkuToken, SKU_ID };
