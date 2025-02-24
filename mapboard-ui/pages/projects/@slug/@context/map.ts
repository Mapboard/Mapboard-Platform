// Import other components
import hyper from "@macrostrat/hyper";
import { useEffect, useMemo, useState } from "react";
import {
  BaseInfoDrawer,
  FloatingNavbar,
  MapAreaContainer,
  MapView,
  PanelCard,
} from "@macrostrat/map-interface";
import styles from "./map.module.scss";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import {
  BasemapType,
  SelectionMode,
  useMapActions,
  useMapState,
} from "./state";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { useMapRef } from "@macrostrat/mapbox-react";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle } from "./style";
import { BoxSelectionManager, buildSelectionLayers } from "./_tools";
import { SelectionActionsPanel } from "./selection";
import { FormGroup, OptionProps, SegmentedControl } from "@blueprintjs/core";

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
  const style = useMapStyle(baseURL, isMapView, {
    mapboxToken,
  });
  const isOpen = useMapState((state) => state.layerPanelIsOpen);

  let projection = { name: "globe" };
  if (!isMapView) {
    projection = { name: "mercator" };
  }

  if (style == null) {
    return null;
  }

  // const toolsCard = h(PanelCard, { className: "tools-panel" }, [
  //   h("h4", "Tools"),
  //   h(Button, { icon: "selection", small: true }, "Select"),
  // ]);

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
      //detailPanel: h("div.right-elements", [toolsCard, h(InfoDrawer)]),
      detailPanel: h(InfoDrawer),
      className: "mapboard-map",
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

  return h(
    BaseInfoDrawer,
    {
      title: "Selection",
      onClose() {
        selectFeatures(null);
      },
    },
    [
      h("div.selection-counts", [
        featureTypes.map((type) => {
          const count = selection[type]?.length;
          if (count == null || count == 0) {
            return null;
          }
          return h("p", `${count} ${type} selected`);
        }),
      ]),
      h(SelectionModePicker),
      h(SelectionActionsPanel),
    ],
  );
}

const modes: OptionProps<string>[] = [
  { value: SelectionMode.Add, label: "Add" },
  { value: SelectionMode.Subtract, label: "Subtract" },
  { value: SelectionMode.Replace, label: "Replace" },
];

function SelectionModePicker() {
  /** Picker to define how we are selecting features */
  const setSelectionMode = useMapActions((a) => a.setSelectionMode);
  const activeMode = useMapState((state) => state.selectionMode);
  return h(
    FormGroup,
    {
      className: "selection-mode-control",
      inline: true,
      label: "Selection mode",
    },
    h(SegmentedControl, {
      options: modes,
      value: activeMode,
      onValueChange: setSelectionMode,
      small: true,
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

function useMapStyle(baseURL: string, isMapView: boolean, { mapboxToken }) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const changeTimestamps = useMapState((state) => state.lastChangeTime);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);
  const polygonTypes = useMapState((state) => state.dataTypes.polygon);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [baseStyle, setBaseStyle] = useState(null);
  const [overlayStyle, setOverlayStyle] = useState(null);

  useEffect(() => {
    if (!isMapView) {
      setBaseStyle(null);
      return;
    }
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then(setBaseStyle);
  }, [baseStyleURL, mapboxToken, isMapView]);

  useAsyncEffect(async () => {
    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: activeLayer,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
    });
    setOverlayStyle(style);
  }, [activeLayer, changeTimestamps, showLineEndpoints, enabledFeatureModes]);

  return useMemo(() => {
    if (baseStyle == null || overlayStyle == null) {
      return null;
    }

    return mergeStyles(baseStyle, overlayStyle, {
      layers: buildSelectionLayers(),
    });
  }, [baseStyle, overlayStyle]);
}
