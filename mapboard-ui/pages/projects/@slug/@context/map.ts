// Import other components
import hyper from "@macrostrat/hyper";
import { useState, useEffect } from "react";
import {
  MapView,
  FloatingNavbar,
  buildInspectorStyle,
  MapAreaContainer,
  PanelCard,
} from "@macrostrat/map-interface";
import styles from "./map.module.sass";
import { useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "./state";

export const h = hyper.styled(styles);

export function MapArea({
  mapboxToken = null,
  overlayStyle = null,
  children,
  bounds = null,
  headerElement = null,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  style?: mapboxgl.Style | string;
  children?: React.ReactNode;
  mapboxToken?: string;
  overlayStyle?: mapboxgl.Style | string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  projection?: string;
}) {
  const style = useMapStyle(overlayStyle, { mapboxToken });
  const isOpen = useMapState((state) => state.layerPanelIsOpen);

  if (style == null) {
    return null;
  }

  return h(
    MapAreaContainer,
    {
      navbar: h(FloatingNavbar, {
        headerElement,
        width: "fit-content",
        height: "fit-content",
      }),
      contextPanel: h(PanelCard, [children]),
      contextPanelOpen: isOpen,
      fitViewport: true,
    },
    h(MapView, {
      style,
      mapPosition: null,
      projection: { name: "globe" },
      boxZoom: false,
      mapboxToken,
      bounds,
    }),
  );
}

function useBaseMapStyle(basemapType: BasemapType) {
  const isEnabled = useInDarkMode();
  let baseStyle = isEnabled
    ? "mapbox://styles/mapbox/dark-v10"
    : "mapbox://styles/mapbox/light-v10";
  if (basemapType == "satellite") {
    baseStyle = "mapbox://styles/mapbox/satellite-v9";
  } else if (basemapType == "terrain") {
    baseStyle = isEnabled
      ? "mapbox://styles/jczaplewski/ckfxmukdy0ej619p7vqy19kow"
      : "mapbox://styles/jczaplewski/ckxcu9zmu4aln14mfg4monlv3";
  }
  return baseStyle;
}

function useMapStyle(overlayStyle, { mapboxToken }) {
  const basemapType = useMapState((state) => state.baseMap);
  const baseStyle = useBaseMapStyle(basemapType);
  const isEnabled = useInDarkMode();

  const [style, setStyle] = useState(null);

  useEffect(() => {
    buildInspectorStyle(baseStyle, overlayStyle, {
      mapboxToken,
      inDarkMode: isEnabled,
      xRay: false,
    }).then(setStyle);
  }, [baseStyle, mapboxToken, isEnabled, overlayStyle]);

  return style;
}
