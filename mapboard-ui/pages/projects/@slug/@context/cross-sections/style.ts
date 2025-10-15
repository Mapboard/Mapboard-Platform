import { useMemo } from "react";

import { buildMapOverlayStyle } from "../style";
import { useMapState } from "../state";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { allFeatureModes } from "../types";
import { useAtomValue } from "jotai";
import { crossSectionReloadCounterAtom } from "../change-watcher";

export function useCrossSectionStyle(baseURL: string) {
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const showCrossSections = useMapState((d) => d.showCrossSectionLines);

  // Reloader for cross section style
  const revision = useAtomValue(crossSectionReloadCounterAtom);

  return useMemo(() => {
    if (!showCrossSections) return null;
    console.log("Cross section style revision", revision);
    const opts = {
      selectedLayer: null,
      enabledFeatureModes: allFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
      clipToContextBounds: true,
      revision,
      visible: true,
    };
    const coreStyle = buildMapOverlayStyle(baseURL, opts);

    const mainStyle: mapboxgl.StyleSpecification = {
      version: 8,
      name: "Mapboard cross sections",
      layers: [],
      sources: {},
    };

    let style = mergeStyles(coreStyle, mainStyle);
    console.log(style);
    delete style.sprite;
    return style;
  }, [
    baseURL,
    showLineEndpoints,
    showFacesWithNoUnit,
    showTopologyPrimitives,
    showCrossSections,
    revision,
  ]);
}
