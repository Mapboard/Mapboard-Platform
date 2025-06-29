// Import other components
import hyper from "@macrostrat/hyper";
import {
  FloatingNavbar,
  MapAreaContainer,
  MapMarker,
  MapView,
  PanelCard,
} from "@macrostrat/map-interface";
import styles from "./map.module.scss";
import { useMapActions, useMapState } from "./state";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { useMapRef } from "@macrostrat/mapbox-react";
import { useMapStyle } from "./style";
import { useStyleImageManager } from "./style/pattern-manager";
import { BoxSelectionManager } from "./selection";
import { MapReloadWatcher } from "./change-watcher";
import { SelectionDrawer } from "./selection/control-panel";
import { useMemo } from "react";

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
  const isOpen = useMapState((state) => state.layerPanelIsOpen);
  const onSelectPosition = useMapActions((a) => a.setInspectPosition);
  const inspectPosition = useMapState((state) => state.inspectPosition);

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
      contextPanel: h(PanelCard, [children]),
      contextPanelOpen: isOpen,
      fitViewport: true,
      //detailPanel: h("div.right-elements", [toolsCard, h(InfoDrawer)]),
      detailPanel: h(SelectionDrawer),
      className: "mapboard-map",
    },
    [
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
      h(MapMarker, {
        position: inspectPosition,
        setPosition: onSelectPosition,
      }),
      h(MapReloadWatcher, { baseURL }),
    ],
  );
}

function MapInner({
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

  useStyleImageManager(mapRef);

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
