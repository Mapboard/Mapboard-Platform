// Import other components
import hyper from "@macrostrat/hyper";
import { useState, useEffect } from "react";
import {
  MapView,
  FloatingNavbar,
  MapLoadingButton,
  buildInspectorStyle,
  MapAreaContainer,
  PanelCard,
} from "@macrostrat/map-interface";
import styles from "./map.module.sass";
import { useInDarkMode } from "@macrostrat/ui-components";
import { useMapState } from "./state";

export const h = hyper.styled(styles);

export function MapArea({
  mapboxToken = null,
  overlayStyle = null,
  children,
  bounds = null,
  headerElement = null,
  contextPanelOpen,
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

function useMapStyle(overlayStyle, { mapboxToken }) {
  const isEnabled = useInDarkMode();
  const baseStyle = isEnabled
    ? "mapbox://styles/mapbox/dark-v10"
    : "mapbox://styles/mapbox/light-v10";

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
