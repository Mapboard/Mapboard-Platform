// Import other components
import hyper from "@macrostrat/hyper";
import {
  FloatingNavbar,
  MapAreaContainer,
  MapView,
} from "@macrostrat/map-interface";
import styles from "../map.module.scss";
import { useMapActions, useMapState } from "../state";
import { useMapRef } from "@macrostrat/mapbox-react";
import { useMapStyle } from "../style";
import { useStyleImageManager } from "../style/pattern-manager";
import { SelectionDrawer } from "../selection";
import type { RequestTransformFunction } from "mapbox-gl";
import { CrossSectionsLayer } from "../cross-sections";
import { useRequestTransformer } from "../transform-request";
import { expandBounds, MapMarker } from "../map-utils";

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
  transformRequest?: RequestTransformFunction;
  contextPanel?: React.ReactElement;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
}) {
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
      contextPanel: null,
      fitViewport: false,
      detailPanel: h(SelectionDrawer),
      className: "mapboard-map",
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
      h(MapMarker),
      children,
    ],
  );
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
    maxBounds = expandBounds(bounds, { aspectRatio });
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
    loadingIgnoredSources: ["crossSectionCursor"],
    ...rest,
  });
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
