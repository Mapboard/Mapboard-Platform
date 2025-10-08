import hyper from "@macrostrat/hyper";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "../map.module.scss";
import {
  useMapDispatch,
  useMapInitialized,
  useMapRef,
  useMapStatus,
} from "@macrostrat/mapbox-react";
import maplibre, { ScaleControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CameraPosition, MapPosition } from "@macrostrat/mapbox-utils";
import { getMapPadding } from "@macrostrat/map-interface";
import { useAsyncEffect } from "@macrostrat/ui-components";
import { setMapPosition } from "@macrostrat/mapbox-utils";
import { mapboxToken } from "~/settings";
import { debounce } from "lodash";

const h = hyper.styled(styles);

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
    h(StyleLoadedReporter, { onStyleLoaded }),
    h(MapMovedReporter, { onMapMoved }),
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

/** Todo: reintegrate these utility functions with Mapbox utils */
export function MapMovedReporter({ onMapMoved = null }) {
  const mapRef = useMapRef();
  const dispatch = useMapDispatch();
  const isInitialized = useMapInitialized();

  const mapMovedCallback = useCallback(() => {
    const map = mapRef.current;
    if (map == null) return;
    const mapPosition = getMapPosition(map);
    dispatch({ type: "map-moved", payload: mapPosition });
    onMapMoved?.(mapPosition, map);
  }, [onMapMoved, dispatch, isInitialized]);

  useEffect(() => {
    // Get the current value of the map. Useful for gradually moving away
    // from class component
    const map = mapRef.current;
    if (map == null) return;
    // Update the URI when the map moves
    mapMovedCallback();
    const cb = debounce(mapMovedCallback, 100);
    map.on("moveend", cb);
    return () => {
      map?.off("moveend", cb);
    };
  }, [mapMovedCallback]);
  return null;
}

function getMapPosition(map: maplibre.Map): MapPosition {
  return {
    camera: getCameraPosition(map),
    target: {
      ...map.getCenter(),
      zoom: map.getZoom(),
    },
  };
}

function getCameraPosition(map: maplibre.Map): CameraPosition {
  const latLong = map.transform.getCameraLngLat();
  return {
    lng: latLong.lng,
    lat: latLong.lat,
    altitude: map.transform.getCameraAltitude(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
}
