import hyper from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../../state";
import { MapLoadingButton } from "@macrostrat/map-interface";
import { BoundsLayer } from "~/client-components";
import { BackButton, LayerControlPanel } from "../../controls";
import { bbox } from "@turf/bbox";

// Import other components
import {
  FloatingNavbar,
  getMapPadding,
  MapAreaContainer,
} from "@macrostrat/map-interface";
import styles from "./map.module.scss";
import { useMapActions, useMapState } from "../../state";
import { useStyleImageManager } from "../../style/pattern-manager";
import type { RequestTransformFunction } from "mapbox-gl";
import { useRequestTransformer } from "../../transform-request";
import { expandBounds } from "../../map-utils";
import { useDisplayStyle } from "../../display/style";

import React, { useEffect, useRef, useState } from "react";
import { useMapDispatch, useMapRef } from "@macrostrat/mapbox-react";
import maplibre, { ScaleControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPosition } from "@macrostrat/mapbox-utils";
import { useAsyncEffect } from "@macrostrat/ui-components";
import {
  MapMovedReporter,
  setMapPosition,
  StyleLoadedReporter,
} from "~/maplibre/utils";
import { computeTiledBounds, mercatorBBox } from "~/maplibre";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    MapStateProvider,
    { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
    h(PageInner, { baseURL, context: ctx }),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const isMapContext = ctx.type === "map";


  const bounds = mercatorBBox(bbox(ctx.bounds));

  const tileBounds = computeTiledBounds(bounds, { metersPerPixel: 200 });
  console.log(tileBounds);

  return h(
    "div.map-viewer",
    h(
      MapArea,
      {
        mapboxToken,
        title: ctx.name,
        baseURL,
        bounds,
        headerElement: h(ContextHeader, ctx),
        contextPanel: h(LayerControlPanel),
        isMapView: isMapContext,
      },
      h(BoundsLayer, { bounds: ctx.bounds, visible: true }),
    ),
  );
}

function ContextHeader({ project_name, project_slug, name }) {
  const isOpen = useMapState((state) => state.layerPanelIsOpen);
  const setOpen = useMapState((state) => state.actions.toggleLayerPanel);

  return h("div.nav-header", [
    h("div.title-block", [
      h(
        BackButton,
        { href: `/projects/${project_slug}`, className: "back-to-project" },
        project_name,
      ),
      h("h2", "Display map"),
    ]),
    h("div.settings-toggle", [
      h(MapLoadingButton, {
        large: true,
        icon: "cog",
        active: isOpen,
        className: "layer-toggle",
        onClick: () => setOpen(!isOpen),
      }),
    ]),
  ]);
}

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
  const transformRequest = useRequestTransformer(true);

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
      // Can't use controls with MapLibre
      mapControls: null,
      fitViewport: false,
      detailPanel: null,
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
      children,
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
  const projectID = useMapState((d) => d.context.project_id);

  useStyleImageManager();

  const style = useDisplayStyle(baseURL, {
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
    maxBounds = expandBounds(bounds);
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
    loadingIgnoredSources: ["crossSectionCursor"],
    onMapMoved: setMapPosition,
    ...rest,
  });
}

function defaultInitializeMap(container, args: MapboxOptionsExt = {}) {
  const { mapPosition, ...rest } = args;

  const map = new maplibre.Map({
    container,
    maxZoom: 18,
    trackResize: false,
    // This is a legacy option for Mapbox GL v2
    // @ts-ignore
    ...rest,
  });

  let _mapPosition = mapPosition;
  if (_mapPosition == null && rest.center == null && rest.bounds == null) {
    // If no map positioning information is provided, we use the default
    _mapPosition = defaultMapPosition;
  }

  // set initial map position
  if (_mapPosition != null) {
    setMapPosition(map, _mapPosition);
  }

  let scale = new ScaleControl({
    maxWidth: 200,
    unit: "metric",
  });
  map.addControl(scale, "bottom-right");

  return map;
}

function prepareStyleForMaplibre(
  style: mapboxgl.StyleSpecification,
  accessToken: string,
): maplibre.StyleSpecification {
  // Convert any Mapbox-specific properties to Maplibre-compatible ones
  let newStyle = {
    ...style,
    layers: style.layers.filter((d) => d.type !== "sky"),
  };

  //delete newStyle.sources["terrain"];

  return newStyle;
}

const defaultMapPosition: MapPosition = {
  camera: {
    lat: 34,
    lng: -120,
    altitude: 300000,
  },
};

type MapboxCoreOptions = Omit<maplibre.MapOptions, "container">;

export interface MapViewProps extends MapboxCoreOptions {
  showLineSymbols?: boolean;
  children?: React.ReactNode;
  infoMarkerPosition?: mapboxgl.LngLatLike;
  mapPosition?: MapPosition;
  initializeMap?: (
    container: HTMLElement,
    args: MapboxOptionsExt,
  ) => maplibre.Map;
  onMapLoaded?: (map: mapboxgl.Map) => void;
  onStyleLoaded?: (map: mapboxgl.Map) => void;
  onMapMoved?: (mapPosition: MapPosition, map: mapboxgl.Map) => void;
  /** This map sets its own viewport, rather than being positioned by a parent.
   * This is a hack to ensure that the map can overflow its "safe area" when false */
  standalone?: boolean;
  /** Overlay styles to apply to the map: a list of mapbox style objects or fragments to
   * overlay on top of the main map style at runtime */
  overlayStyles?: Partial<mapboxgl.StyleSpecification>[];
  /** A function to transform the map style before it is loaded */
  loadingIgnoredSources?: string[];
  id?: string;
  className?: string;
}

export interface MapboxOptionsExt extends MapboxCoreOptions {
  mapPosition?: MapPosition;
}

export function MapView(props: MapViewProps) {
  const {
    style,
    mapPosition,
    initializeMap = defaultInitializeMap,
    children,
    infoMarkerPosition,
    onMapLoaded = null,
    onStyleLoaded = null,
    onMapMoved = null,
    standalone = false,
    overlayStyles,
    trackResize = true,
    loadingIgnoredSources = ["elevationMarker", "crossSectionEndpoints"],
    className,
    ...rest
  } = props;

  const dispatch = useMapDispatch();
  let mapRef = useMapRef();
  const ref = useRef<HTMLDivElement>();
  const parentRef = useRef<HTMLDivElement>();

  const [baseStyle, setBaseStyle] = useState<maplibre.Style>(null);

  useEffect(() => {
    /** Manager to update map style */
    if (baseStyle == null) return;
    let map = mapRef.current;

    let newStyle: mapboxgl.StyleSpecification = baseStyle;

    if (map != null) {
      dispatch({ type: "set-style-loaded", payload: false });
      map.setStyle(newStyle);
    } else {
      const map = initializeMap(ref.current, {
        style: newStyle,
        mapPosition,
        ...rest,
      });
      dispatch({ type: "set-map", payload: map });
      map.setPadding(getMapPadding(ref, parentRef), { animate: false });
      onMapLoaded?.(map);
    }
  }, [baseStyle]);

  useAsyncEffect(async () => {
    /** Manager to update map style */
    setBaseStyle(
      prepareStyleForMaplibre(
        style as mapboxgl.StyleSpecification,
        mapboxToken,
      ),
    );
  }, [style]);

  return h("div.map-view-container.main-view", { ref: parentRef, className }, [
    h("div.mapbox-map.map-view", { ref }),
    h(StyleLoadedReporter, { onStyleLoaded: null }),
    h(MapMovedReporter, { onMapMoved: null }),
    children,
  ]);
}
