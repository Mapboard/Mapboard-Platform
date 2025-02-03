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
import mapboxgl, { Style } from "mapbox-gl";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { useMapPosition, useMapRef } from "@macrostrat/mapbox-react";

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export const h = hyper.styled(styles);

export function MapArea({
  mapboxToken = null,
  overlayStyle = null,
  children,
  bounds = null,
  headerElement = null,
  isMapView = true,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  style?: mapboxgl.Style | string;
  children?: React.ReactNode;
  mapboxToken?: string;
  overlayStyle?: mapboxgl.Style | string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
}) {
  const style = useMapStyle(overlayStyle, isMapView, { mapboxToken });
  const isOpen = useMapState((state) => state.layerPanelIsOpen);

  let projection = { name: "globe" };
  if (!isMapView) {
    projection = { name: "mercator" };
  }

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
    h(MapInner, {
      style,
      mapPosition: null,
      projection,
      boxZoom: false,
      mapboxToken,
      bounds,
      fitBounds: !isMapView,
    }),
  );
}

function MapInner({ fitBounds, bounds, ...rest }) {
  let maxBounds: BBox | null = null;

  const mapRef = useMapRef();

  let aspectRatio = 1;
  const rect = mapRef?.current?.getContainer().getBoundingClientRect();
  if (rect != null) {
    const { width, height } = rect;
    aspectRatio = width / height;
  }

  if (fitBounds) {
    maxBounds = expandBounds(bounds, aspectRatio);
  }

  return h(MapView, { maxBounds, bounds, ...rest });
}

type BBox = [number, number, number, number];

function expandBounds(bounds: BBox, aspectRatio = 1, margin = 0.1) {
  // Make bounds square and expand to ensure that the entire cross-section can be viewed
  if (bounds == null) {
    return null;
  }
  const webMercatorBBox = mercator.convert(bounds, "900913");
  const [minX, minY, maxX, maxY] = webMercatorBBox;

  const center = [(minX + maxX) / 2, (minY + maxY) / 2];
  let dx = maxX - minX;
  let dy = maxY - minY;

  const m = (Math.max(dx, dy) * margin) / 2;

  dx += m;
  dy += m;

  let bbox2: BBox;
  if (dx > dy) {
    dy = dx / aspectRatio;
  } else {
    dx = dy * aspectRatio;
  }

  bbox2 = [
    center[0] - dx / 2,
    center[1] - dy / 2,
    center[0] + dx / 2,
    center[1] + dy / 2,
  ];
  return mercator.convert(bbox2, "WGS84");
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

function useMapStyle(overlayStyle: Style, isMapView: boolean, { mapboxToken }) {
  const basemapType = useMapState((state) => state.baseMap);
  let baseStyle = useBaseMapStyle(basemapType);
  const isEnabled = useInDarkMode();

  const [style, setStyle] = useState(null);

  useEffect(() => {
    buildInspectorStyle(baseStyle, overlayStyle, {
      mapboxToken,
      inDarkMode: isEnabled,
      xRay: false,
    }).then(setStyle);
  }, [baseStyle, mapboxToken, isEnabled, overlayStyle]);

  if (!isMapView) {
    return overlayStyle;
  }

  return style;
}
