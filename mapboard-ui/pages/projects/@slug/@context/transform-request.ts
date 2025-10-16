import { useMapState } from "./state";
import { useMemo } from "react";
import {
  isMapboxURL,
  transformMapboxUrl,
} from "maplibregl-mapbox-request-transformer";
import { mapboxToken } from "~/settings";
import { atom, useAtomValue } from "jotai";
import { query } from "express";

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

const skuTokenAtom = atom(createSkuToken());

const useDEMTileLayer = () => {
  const baseLayers = useMapState((state) => state.baseLayers);
  const layer = useMemo(() => {
    return baseLayers?.find((layer) => layer.type === "dem");
  }, [baseLayers]);
  return layer;
};

const demBaseURL = "https://mapboard.local/dem-tiles/tiles";
const fallbackLayer =
  "https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1";

export function useRequestTransformer(
  transformMapboxRequests: boolean = false,
) {
  const dem = useDEMTileLayer();

  const { token } = useAtomValue(skuTokenAtom);

  // Check if there's a DEM layer in the base layers
  return useMemo(() => {
    if (dem == null && !transformMapboxRequests) {
      return null;
    }

    return (url, resourceType) => {
      let transformedURL = url;
      if (transformMapboxRequests) {
        if (isMapboxURL(url)) {
          const res = transformMapboxUrl(url, resourceType, mapboxToken);
          transformedURL = res.url;

          // Add a sku token
          const [base, queryString] = transformedURL.split("?");
          const query = new URLSearchParams(queryString);
          query.set("sku", token);
          transformedURL = base + "?" + query.toString();
        }
      }

      /** Common API to use for transforming requests for caching or modifying */
      const tilesetID = "mapbox.mapbox-terrain-dem-v1";

      const [baseURL, query, ...rest] = transformedURL.split("?");
      if (resourceType == "Tile" && baseURL.includes(tilesetID)) {
        // We want to send this request to our elevation tiling backend, preserving query args

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

      console.log(url, transformedURL);

      return { url: transformedURL };
    };
  }, [dem, transformMapboxRequests]);
}

export function useDEMTileURL() {
  const dem = useDEMTileLayer();
  const { token } = useAtomValue(skuTokenAtom);

  let queryArgs = new URLSearchParams();
  let baseURL = fallbackLayer;
  if (dem != null) {
    queryArgs.set("x-overlay-layer", dem.url);
    baseURL = demBaseURL;
    queryArgs.set("x-fallback-layer", fallbackLayer);
  }
  baseURL += "/{z}/{x}/{y}.png";
  queryArgs.set("sku", token);
  queryArgs.set("access_token", mapboxToken);

  return baseURL + "?" + queryArgs.toString();
}
