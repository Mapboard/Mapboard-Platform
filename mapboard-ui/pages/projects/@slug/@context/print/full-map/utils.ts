import { useRequestTransformer } from "../../transform-request";
import { setupStyleImageManager } from "../../style/pattern-manager";
import maplibre from "maplibre-gl";
import { useCallback } from "react";

export function useInitializeMap() {
  const transformRequest = useRequestTransformer(true);
  return useCallback(
    (opts: maplibre.MapOptions) => {
      const map = new maplibre.Map({
        ...opts,
        transformRequest,
        pixelRatio: 4,
      });
      setupStyleImageManager(map);
      return map;
    },
    [transformRequest],
  );
}
