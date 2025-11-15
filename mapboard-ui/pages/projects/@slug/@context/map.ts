// Import other components
import hyper from "@macrostrat/hyper";
import {
  FloatingNavbar,
  MapAreaContainer,
  MapView,
  PanelCard,
} from "@macrostrat/map-interface";
import styles from "./map.module.scss";
import { useMapActions, useMapState } from "./state";
import { useMapRef } from "@macrostrat/mapbox-react";
import { useMapStyle } from "./style";
import { useStyleImageManager } from "./style/pattern-manager";
import { BoxSelectionManager, SelectionDrawer } from "./selection";
import { MapReloadWatcher } from "./change-watcher";
import type { RequestTransformFunction } from "mapbox-gl";
import { CrossSectionPanel, CrossSectionsLayer } from "./cross-sections";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { useRequestTransformer } from "./transform-request";
import { BBox, expandBounds, MapMarker } from "./map-utils";

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
  const isOpen = useMapState((state) => state.layerPanelIsOpen);

  const activeCrossSection = useMapState((state) => state.activeCrossSection);
  const setActiveCrossSection = useMapState(
    (state) => state.setActiveCrossSection,
  );

  /** Add a cross section assistant panel if a cross section is active */
  let bottomPanel = null;
  if (activeCrossSection != null) {
    bottomPanel = h(CrossSectionPanel, { id: activeCrossSection });
  }

  const transformRequest = useRequestTransformer();

  let projection = { name: "globe" };
  if (!isMapView) {
    projection = { name: "mercator" };
  }

  const mainArea = h(
    MapAreaContainer,
    {
      navbar: h(FloatingNavbar, {
        headerElement,
        width: "fit-content",
        height: "fit-content",
      }),
      contextPanel: h.if(contextPanel != null)(PanelCard, null, contextPanel),
      contextPanelOpen: isOpen,
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
      h(BoxSelectionManager),
      h(MapMarker),
      h(MapReloadWatcher, { baseURL }),
      children,
    ],
  );

  return h(
    Allotment,
    {
      vertical: true,
      onVisibleChange(paneIndex, visible) {
        // When the bottom panel is closed, clear the active cross-section
        if (paneIndex === 1 && !visible) {
          setActiveCrossSection(null);
        }
      },
    },
    [
      h(
        Allotment.Pane,
        {
          preferredSize: "80%",
          minSize: 300,
        },
        mainArea,
      ),
      h(
        Allotment.Pane,
        {
          preferredSize: "20%",
          minSize: 100,
          snap: true,
          visible: activeCrossSection != null,
        },
        bottomPanel,
      ),
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
  const projectID = useMapState((d) => d.context.project_id);

  useStyleImageManager();

  const style = useMapStyle(baseURL, {
    isMapView,
    mapboxToken,
    projectID,
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
