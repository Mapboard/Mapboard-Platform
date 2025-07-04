// Import other components
import hyper from "@macrostrat/hyper";
import {
  FloatingNavbar,
  MapAreaContainer,
  MapView,
  PanelCard,
  useMapMarker,
} from "@macrostrat/map-interface";
import styles from "./map.module.scss";
import { useMapActions, useMapState } from "./state";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { useMapRef, useMapStyleOperator } from "@macrostrat/mapbox-react";
import { useMapStyle, useStyleLayerIDs } from "./style";
import { useStyleImageManager } from "./style/pattern-manager";
import { BoxSelectionManager } from "./selection";
import { MapReloadWatcher } from "./change-watcher";
import { SelectionDrawer } from "./selection/control-panel";
import { useMemo, useRef } from "react";
import { getCSSVariable } from "@macrostrat/color-utils";
import { updateStyleLayers } from "@macrostrat/mapbox-utils";

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
  contextPanel = null,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  contextPanel?: React.ReactElement;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
}) {
  const isOpen = useMapState((state) => state.layerPanelIsOpen);

  const activeCrossSection = useMapState((state) => state.activeCrossSection);

  let bottomPanel = null;
  if (activeCrossSection != null) {
    bottomPanel = h("div.bottom-panel", [
      h(CrossSectionPanel, { id: activeCrossSection }),
    ]);
  }

  const transformRequest = useRequestTransformer();

  let projection = { name: "globe" };
  if (!isMapView) {
    projection = { name: "mercator" };
  }

  return h(
    MapAreaContainer,
    {
      navbar: h(FloatingNavbar, {
        headerElement,
        width: "fit-content",
        height: "fit-content",
      }),
      contextPanel: h.if(contextPanel != null)(PanelCard, null, contextPanel),
      contextPanelOpen: isOpen,
      fitViewport: true,
      //detailPanel: h("div.right-elements", [toolsCard, h(InfoDrawer)]),
      detailPanel: h(SelectionDrawer),
      className: "mapboard-map",
      bottomPanel,
    },
    [
      h(CrossSectionsLayer),
      h(MapInner, {
        projection,
        boxZoom: false,
        mapboxToken,
        bounds,
        fitBounds: !isMapView,
        maxZoom: 22,
        baseURL,
        isMapView,
        transformRequest,
      }),
      h(BoxSelectionManager),
      h(MapMarker),
      h(MapReloadWatcher, { baseURL }),
      children,
    ],
  );
}

function MapMarker() {
  const position = useMapState((state) => state.inspect?.position);
  const setPosition = useMapActions((a) => a.setInspectPosition);
  const layerIDs = useStyleLayerIDs();

  const mapRef = useMapRef();
  const markerRef = useRef(null);

  useMapMarker(mapRef, markerRef, position);

  useMapStyleOperator(
    (map) => {
      map.removeInteraction("inspect-click");
      map.addInteraction("inspect-click", {
        type: "click",
        handler(e) {
          const r = 10;
          const pt = e.point;

          const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
            [pt.x - r, pt.y - r],
            [pt.x + r, pt.y + r],
          ];
          const tileFeatureData = map.queryRenderedFeatures(bbox, {
            layers: layerIDs,
          });
          setPosition(e.lngLat, tileFeatureData);
        },
      });
    },
    [setPosition, layerIDs],
  );

  return null;
}

import GeoJSON from "geojson";
import mapboxgl, { GeoJSONSource } from "mapbox-gl";
import { CrossSectionPanel } from "./cross-sections";
import { setGeoJSON } from "@macrostrat/mapbox-utils";

function CrossSectionsLayer() {
  const crossSections = useMapState((state) => state.crossSectionLines);
  const showCrossSectionLines = useMapState(
    (state) => state.showCrossSectionLines,
  );
  const setActiveSection = useMapState((state) => state.setActiveCrossSection);

  const allSections = showCrossSectionLines ? crossSections : null;
  const activeSection = useMapState((state) => state.activeCrossSection);
  const id = "crossSectionLine";

  useMapStyleOperator(
    (map) => {
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: allSections ?? [],
      };
      setGeoJSON(map, id, data);
    },
    [allSections],
  );

  useMapStyleOperator(
    (map) => {
      // Set up style
      const color = getCSSVariable("--text-color") ?? "white";

      let sizeExpr: any = 2;
      let opacityExpr: any = 1;

      if (activeSection != null) {
        // If a section is active, use a larger size and opacity
        sizeExpr = [
          "case",
          ["boolean", ["feature-state", "active"], false],
          4,
          3,
        ];

        opacityExpr = [
          "case",
          ["boolean", ["feature-state", "active"], false],
          1,
          0.2,
        ];
      }

      updateStyleLayers(map, [
        {
          id: "cross-section-lines",
          type: "line",
          source: id,
          paint: {
            "line-color": color,
            "line-width": sizeExpr,
            "line-opacity": opacityExpr,
          },
        },
        {
          id: "cross-section-endpoints",
          type: "circle",
          source: id,
          paint: {
            "circle-color": color,
            "circle-radius": sizeExpr,
            "circle-opacity": opacityExpr,
          },
        },
      ]);

      // Set up feature state for active section
      map.removeFeatureState({ source: "crossSectionLine" });

      if (activeSection == null) {
        return;
      }
      // Set feature state for the active section
      map.setFeatureState(
        { source: "crossSectionLine", id: activeSection },
        { active: true },
      );
    },
    [activeSection],
  );

  // Click handling for cross-section lines
  useMapStyleOperator(
    (map) => {
      const layerId = "cross-section-lines";
      map.removeInteraction("cross-section-click");
      map.addInteraction("cross-section-click", {
        target: { layerId },
        type: "click",
        handler: (e) => {
          const id = e.feature?.id;
          if (id == null) return;
          setActiveSection(id);
          e.originalEvent.stopPropagation();
          e.preventDefault();
        },
      });

      const onMouseEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };

      const onMouseLeave = () => {
        map.getCanvas().style.cursor = "";
      };

      // could probably set classes instead of using mouseenter/mouseleave
      map.on("mouseenter", layerId, onMouseEnter);

      map.on("mouseleave", layerId, onMouseLeave);

      // TODO: upstream add cleanup functions
    },
    [setActiveSection],
  );

  return null;
}

export function MapInner({
  baseURL,
  fitBounds,
  bounds,
  mapboxToken,
  isMapView,
  ...rest
}) {
  let maxBounds: BBox | null = null;

  const mapRef = useMapRef();

  const setMapPosition = useMapActions((a) => a.setMapPosition);
  const mapPosition = useMapState((state) => state.mapPosition);

  useStyleImageManager();

  const style = useMapStyle(baseURL, {
    isMapView,
    mapboxToken,
  });
  if (style == null) {
    return null;
  }

  let aspectRatio = 1;
  const rect = mapRef?.current?.getContainer().getBoundingClientRect();
  if (rect != null) {
    const { width, height } = rect;
    aspectRatio = width / height;
  }

  if (fitBounds) {
    maxBounds = expandBounds(bounds, aspectRatio);
  }

  let _bounds = null;
  let _mapPosition = null;
  if (mapPosition == null) {
    _bounds = bounds;
  } else {
    _mapPosition = mapPosition;
  }

  return h(MapView, {
    maxBounds,
    bounds: _bounds,
    mapPosition: _mapPosition,
    mapboxToken,
    style,
    onMapMoved: setMapPosition,
    ...rest,
  });
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

enum ExistingLayersAction {
  Replace = "replace",
  Merge = "merge",
  Skip = "skip",
}

type StyleUpdateConfig = {
  onExistingLayers?: ExistingLayersAction;
  removeLayers?: string[];
};

function useRequestTransformer() {
  const baseLayers = useMapState((state) => state.baseLayers);
  // Check if there's a DEM layer in the base layers
  return useMemo(() => {
    const dem = baseLayers?.find((layer) => layer.type === "dem");

    if (dem == null) {
      return null;
    }
    console.log("Using DEM layer for request transformation", dem);

    return (url, resourceType) => {
      /** Common API to use for transforming requests for caching or modifying */
      const start =
        "https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1";
      if (resourceType !== "Tile" || !url.startsWith(start)) return;
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
  }, [baseLayers]);
}
