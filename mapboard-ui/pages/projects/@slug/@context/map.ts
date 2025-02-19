// Import other components
import hyper from "@macrostrat/hyper";
import { useState, useEffect } from "react";
import {
  MapView,
  FloatingNavbar,
  buildInspectorStyle,
  MapAreaContainer,
  PanelCard,
  BaseInfoDrawer,
} from "@macrostrat/map-interface";
import styles from "./map.module.sass";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapActions, useMapState } from "./state";
import mapboxgl, { Style } from "mapbox-gl";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { useMapRef } from "@macrostrat/mapbox-react";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle } from "./style";
import { BoxSelectionManager, buildSelectionLayers } from "./_tools";

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export const h = hyper.styled(styles);

export function MapArea({
  mapboxToken = null,
  baseURL = null,
  children,
  bounds = null,
  headerElement = null,
  isMapView = true,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
}) {
  const style = useMapStyle(baseURL, isMapView, { mapboxToken });
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
      detailPanel: h(InfoDrawer),
    },
    [
      h(MapInner, {
        style,
        mapPosition: null,
        projection,
        boxZoom: false,
        mapboxToken,
        bounds,
        fitBounds: !isMapView,
      }),
      h(BoxSelectionManager),
    ],
  );
}

const featureTypes = ["lines", "points", "polygons"];

function InfoDrawer() {
  const selection = useMapState((state) => state.selection);
  const selectFeatures = useMapActions((a) => a.selectFeatures);
  if (selection == null) {
    return null;
  }

  console.log(selection);

  return h(
    BaseInfoDrawer,
    {
      title: "Selection",
      onClose() {
        selectFeatures(null);
      },
    },
    featureTypes.map((type) => {
      const count = selection[type]?.length;
      if (count == null) {
        return null;
      }
      return h("p", `${count} ${type} selected`);
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

function getBaseMapStyle(basemapType: BasemapType) {
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

function useMapStyle(baseURL: string, isMapView: boolean, { mapboxToken }) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const isEnabled = useInDarkMode();

  let baseStyle = getBaseMapStyle(basemapType);

  const [style, setStyle] = useState(null);

  useAsyncEffect(async () => {
    let overlayStyle = buildMapOverlayStyle(baseURL, activeLayer);

    overlayStyle = mergeStyles(overlayStyle, {
      layers: buildSelectionLayers(),
    });

    if (!isMapView) {
      setStyle(overlayStyle);
      return;
    }
    const style = await buildInspectorStyle(baseStyle, overlayStyle, {
      mapboxToken,
      inDarkMode: isEnabled,
      xRay: false,
    });
    setStyle(style);
  }, [basemapType, mapboxToken, isEnabled, baseURL, activeLayer, isMapView]);

  return style;
}
