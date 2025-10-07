import { useMapState } from "./state";
import { useMemo } from "react";
import {
  isMapboxURL,
  transformMapboxUrl,
} from "maplibregl-mapbox-request-transformer";

export function useRequestTransformer(
  transformMapboxRequests: boolean = false,
) {
  const baseLayers = useMapState((state) => state.baseLayers);
  // Check if there's a DEM layer in the base layers
  return useMemo(() => {
    const dem = baseLayers?.find((layer) => layer.type === "dem");

    if (dem == null || !transformMapboxRequests) {
      return null;
    }
    console.log("Using DEM layer for request transformation", dem);

    return (url, resourceType) => {
      if (transformMapboxRequests) {
        if (isMapboxURL(url)) {
          return { url: transformMapboxUrl(url) };
        }
      }

      /** Common API to use for transforming requests for caching or modifying */
      const start =
        "https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1";
      if (resourceType !== "Tile" || !url.startsWith(start)) return { url };
      // We want to send this request to our elevation tiling backend, preserving query args
      const [baseURL, query, ...rest] = url.split("?");

      if (rest.length > 0) {
        console.warn(
          "Unexpected URL format, expected no additional path segments after query string",
          rest,
        );
      }

      // This depends on the "elevation-tiler" dependency
      let newURL = "/dem-tiles/tiles" + baseURL.slice(start.length);
      let queryArgs = new URLSearchParams(query);

      queryArgs.set("x-overlay-layer", dem.url);
      queryArgs.set("x-fallback-layer", start);

      return {
        url: newURL + "?" + queryArgs.toString(),
      };
    };
  }, [baseLayers, transformMapboxRequests]);
}
