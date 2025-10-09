import { useData } from "vike-react/useData";
import type { CrossSectionData } from "./+data";
import hyper from "@macrostrat/hyper";

import React, { useEffect, useMemo, useRef } from "react";
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
import { getMapPadding } from "@macrostrat/map-interface";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { StyleLoadedReporter } from "~/maplibre-utils";

const h = hyper.styled(styles);

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export function Page() {
  const crossSections = useData<CrossSectionData[]>() ?? [];

  return h(
    "div.cross-sections",
    crossSections.map((ctx) => {
      return h(CrossSection, { key: ctx.id, data: ctx });
    }),
  );
}

function CrossSection(props: { data: CrossSectionData }) {
  const { data } = props;

  return h("div.cross-section", {}, [
    h("h2.cross-section-title", data.name),
    h(
      MapboxMapProvider,
      h("div.cross-section-map-container", [
        h(CrossSectionMapView, {
          data,
        }),
      ]),
    ),
  ]);
}

interface MapViewProps {
  data: CrossSectionData;
  children?: React.ReactNode;
  className?: string;
}

export function CrossSectionMapView(props: MapViewProps) {
  const { data, children, className, ...rest } = props;

  const dispatch = useMapDispatch();
  let mapRef = useMapRef();
  const ref = useRef<HTMLDivElement>();
  const parentRef = useRef<HTMLDivElement>();

  console.log("Cross section", data);
  let domain = document.location.origin;
  const { project_slug, slug } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  const { width, height, bounds } = computeCrossSectionBounds(data);

  const baseStyle = useMemo(() => {
    return buildCrossSectionStyle(baseURL, {
      showFacesWithNoUnit: true,
      showLineEndpoints: false,
      showTopologyPrimitives: false,
    });
  }, [baseURL]);

  useEffect(() => {
    /** Manager to update map style */
    if (baseStyle == null || ref.current == null) return;
    let map = mapRef.current;

    if (map != null) {
      dispatch({ type: "set-style-loaded", payload: false });
      map.setStyle(baseStyle);
    } else {
      const map = new maplibre.Map({
        container: ref.current,
        bounds,
        style: baseStyle,
        trackResize: false,
        attributionControl: false,
        interactive: false,
        maxZoom: 22,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
        boxZoom: false,

        //pixelRatio: ,
      });

      dispatch({ type: "set-map", payload: map });
      map.setPadding(getMapPadding(ref, parentRef), { animate: false });
      //onMapLoaded?.(map);
    }
  }, [baseStyle]);

  useStyleImageManager();

  const scale = 20;

  const size = {
    width: width / scale,
    height: height / scale,
  };

  return h(
    "div.map-view-container.main-view.cross-section-map",
    {
      ref: parentRef,
      style: {
        "--cross-section-width": `${size.width}px`,
        "--cross-section-height": `${size.height}px`,
      },
    },
    [
      h("div.mapbox-map.map-view", { ref }),
      h(StyleLoadedReporter, { onStyleLoaded: null }),
      children,
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
