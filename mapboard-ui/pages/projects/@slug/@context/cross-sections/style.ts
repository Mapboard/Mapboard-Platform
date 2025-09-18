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
    if (!showCrossSections) return null;
    return buildCrossSectionStyle(baseURL, {
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
    });
  }, [
    baseURL,
    showLineEndpoints,
    showFacesWithNoUnit,
    showTopologyPrimitives,
    showCrossSections,
  ]);
}

type CrossSectionStyleOptions = {
  showLineEndpoints?: boolean;
  showFacesWithNoUnit?: boolean;
  showTopologyPrimitives?: boolean;
};

export function buildCrossSectionStyle(
  baseURL: string,
  opts: CrossSectionStyleOptions,
) {
  const { showLineEndpoints, showFacesWithNoUnit, showTopologyPrimitives } =
    opts;
  const overlay = buildMapOverlayStyle(baseURL, {
    selectedLayer: null,
    sourceChangeTimestamps: [0],
    enabledFeatureModes: allFeatureModes,
    showLineEndpoints,
    showFacesWithNoUnit,
    showTopologyPrimitives,
    clipToContextBounds: true,
  });

  const mainStyle: mapboxgl.StyleSpecification = {
    version: 8,
    name: "Mapboard cross sections",
    layers: [],
    sources: {},
  };

  return mergeStyles(overlay, mainStyle);
}
