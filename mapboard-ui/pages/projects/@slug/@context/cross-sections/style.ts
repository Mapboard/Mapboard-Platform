import { useMemo } from "react";

import { buildMapOverlayStyle } from "../style";
import { useMapState } from "../state";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { allFeatureModes } from "../types";

export function useCrossSectionStyle(baseURL: string) {
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const showCrossSections = useMapState((d) => d.showCrossSectionLines);

  return useMemo(() => {
    const overlay = buildMapOverlayStyle(baseURL, {
      selectedLayer: null,
      sourceChangeTimestamps: [0],
      enabledFeatureModes: allFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
    });

    const mainStyle: mapboxgl.StyleSpecification = {
      version: 8,
      name: "Mapboard cross sections",
      layers: [],
      sources: {},
    };

    return mergeStyles(overlay, mainStyle);
  }, [
    baseURL,
    showLineEndpoints,
    showFacesWithNoUnit,
    showTopologyPrimitives,
    showCrossSections,
  ]);
}
