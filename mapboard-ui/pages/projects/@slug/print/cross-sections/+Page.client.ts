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
} from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { buildCrossSectionStyle } from "../../@context/cross-sections/style";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPosition } from "@macrostrat/mapbox-utils";
import { getMapPadding } from "@macrostrat/map-interface";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { StyleLoadedReporter } from "~/maplibre-utils";

const h = hyper.styled(styles);

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export function Page() {
  const crossSections = useData<Data>() ?? [];

  return h(
    "div.cross-sections",
    crossSections.map((ctx) => {
      return h(CrossSection, { key: ctx.id, data: ctx });
    }),
  );
}

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

function CrossSection(props: { data: ArrayElement<Data> }) {
  const { data } = props;
  console.log("Cross section", data);
  let domain = document.location.origin;
  const { project_slug, slug } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  const { width, height, bounds } = computeCrossSectionBounds(data);

  const scale = 20;

  const size = {
    width: width / scale,
    height: height / scale,
  };

  return h(
    "div.cross-section",
    {
      style: {
        "--cross-section-width": `${size.width}px`,
        "--cross-section-height": `${size.height}px`,
      },
    },
    [
      h("h2.cross-section-title", data.name),
      h(
        MapboxMapProvider,
        h("div.cross-section-map-container", [
          h(MapView, {
            bounds,
            baseURL,
            enableTerrain: false,
            maxZoom: 22,
            pitchWithRotate: false,
            antialias: false,
            dragRotate: false,
            touchPitch: false,
            projection: { name: "mercator" },
            boxZoom: false,
            isMapView: false,
            className: "cross-section-map",
            initializeMap,
          }),
        ]),
      ),
    ],
  );
}

function computeCrossSectionBounds(data) {
  const ll = [data.offset_x, data.offset_y];
  const ur = [data.offset_x + data.length, data.offset_y + 2500];

  const coordinates = [ll, ur].map(mercator.inverse);
  return {
    bounds: bbox({ type: "MultiPoint", coordinates }),
    width: data.length,
    height: ur[1] - ll[1],
  };
}

type MapboxCoreOptions = Omit<maplibre.MapOptions, "container">;

export interface MapViewProps extends MapboxCoreOptions {
  showLineSymbols?: boolean;
  children?: React.ReactNode;
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
    baseURL,
    mapPosition,
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

  const baseStyle = useMemo(() => {
    return buildCrossSectionStyle(baseURL, {
      showFacesWithNoUnit: true,
      showLineEndpoints: false,
      showTopologyPrimitives: false,
    });
  }, [baseURL]);

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

  useStyleImageManager();

  return h("div.map-view-container.main-view", { ref: parentRef, className }, [
    h("div.mapbox-map.map-view", { ref }),
    h(StyleLoadedReporter, { onStyleLoaded }),
    children,
  ]);
}

function initializeMap(container: HTMLElement, args: MapboxOptionsExt) {
  const { mapPosition, ...rest } = args;

  return new maplibre.Map({
    container,
    maxZoom: 18,
    trackResize: false,
    attributionControl: false,
    interactive: false,
    //pixelRatio: ,
    ...rest,
  });
}
