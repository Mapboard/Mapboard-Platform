import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import hyper from "@macrostrat/hyper";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./+Page.client.module.sass";
import { useStyleImageManager } from "../../@context/style/pattern-manager";
import {
  MapboxMapProvider,
  useMapDispatch,
  useMapRef,
  useMapStatus,
} from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { BoundsLayer } from "~/client-components";
import { buildCrossSectionStyle } from "../../@context/cross-sections/style";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPosition, setMapPosition } from "@macrostrat/mapbox-utils";
import { getMapPadding } from "@macrostrat/map-interface";
import { useAsyncEffect } from "@macrostrat/ui-components";

const h = hyper.styled(styles);

export function Page() {
  const crossSections = useData<Data>() ?? [];

  return h(
    "div.cross-sections-page",
    crossSections.map((ctx) => {
      return h(CrossSection, { key: ctx.id, data: ctx });
    }),
  );
}

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

function CrossSection(props: { data: ArrayElement<Data> }) {
  const { data } = props;
  let domain = document.location.origin;
  const { project_slug, slug, bounds } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  return h("div.cross-section", [
    h("h2.cross-section-title", data.name),
    h(CrossSectionMapArea, {
      baseURL,
      bounds,
    }),
  ]);
}

function CrossSectionMapArea({
  mapboxToken = null,
  baseURL = null,
  bounds = null,
}: {
  headerElement?: React.ReactElement;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  bounds: any;
}) {
  return h(
    MapboxMapProvider,
    h("div.cross-section-map-container", [
      h(
        MapInner,
        {
          projection: { name: "mercator" },
          boxZoom: false,
          mapboxToken,
          bounds,
          baseURL,
          isMapView: false,
        },
        [h(BoundsLayer, { bounds, visible: true, zoomToBounds: true })],
      ),
    ]),
  );
}

function MapInner({ baseURL, bounds, ...rest }) {
  const mapRef = useMapRef();

  useStyleImageManager();

  const style = useMemo(() => {
    return buildCrossSectionStyle(baseURL, {
      showFacesWithNoUnit: true,
      showLineEndpoints: false,
      showTopologyPrimitives: false,
    });
  }, [baseURL]);

  const boundsArray = bbox(bounds);

  return h(MapView, {
    bounds: boundsArray,
    style,
    enableTerrain: false,
    maxZoom: 22,
    pitchWithRotate: false,
    antialias: false,
    dragRotate: false,
    touchPitch: false,
    className: "cross-section-map",
    initializeMap,
    ...rest,
  });
}

function initializeMap(container: HTMLElement, args: MapboxOptionsExt) {
  const { mapPosition, ...rest } = args;

  const map = new maplibre.Map({
    container,
    maxZoom: 18,
    trackResize: false,
    attributionControl: false,
    interactive: false,
    ...rest,
  });

  // set initial map position
  if (mapPosition != null) {
    setMapPosition(map, mapPosition);
  }
  //
  return map;
}

type MapboxCoreOptions = Omit<maplibre.MapOptions, "container">;

export interface MapViewProps extends MapboxCoreOptions {
  showLineSymbols?: boolean;
  children?: React.ReactNode;
  mapboxToken?: string;
  // Deprecated
  accessToken?: string;
  terrainSourceID?: string;
  infoMarkerPosition?: mapboxgl.LngLatLike;
  mapPosition?: MapPosition;
  initializeMap?: (
    container: HTMLElement,
    args: MapboxOptionsExt,
  ) => mapboxgl.Map;
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
    enableTerrain = true,
    style,
    mapPosition,
    initializeMap = defaultInitializeMap,
    children,
    infoMarkerPosition,
    transformRequest,
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
        transformRequest,
        ...rest,
      });
      dispatch({ type: "set-map", payload: map });
      map.setPadding(getMapPadding(ref, parentRef), { animate: false });
      onMapLoaded?.(map);
    }
  }, [baseStyle]);

  useAsyncEffect(async () => {
    /** Manager to update map style */
    setBaseStyle(style as mapboxgl.StyleSpecification);
  }, [style]);

  return h("div.map-view-container.main-view", { ref: parentRef, className }, [
    h("div.mapbox-map.map-view", { ref }),
    h(StyleLoadedReporter, { onStyleLoaded }),
    children,
  ]);
}

function StyleLoadedReporter({ onStyleLoaded = null }) {
  /** Check back every 0.1 seconds to see if the map has loaded.
   * We do it this way because mapboxgl loading events are unreliable */
  const isStyleLoaded = useMapStatus((state) => state.isStyleLoaded);
  const mapRef = useMapRef();
  const dispatch = useMapDispatch();

  useEffect(() => {
    if (isStyleLoaded) return;
    const interval = setInterval(() => {
      const map = mapRef.current;
      if (map == null) return;
      if (map.isStyleLoaded()) {
        // Wait a tick before setting the style loaded state
        dispatch({ type: "set-style-loaded", payload: true });
        onStyleLoaded?.(map);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [isStyleLoaded]);

  return null;
}
