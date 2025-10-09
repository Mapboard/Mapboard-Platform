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

  const { pixelSize, bounds } = computeTiledBounds(data);

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
        bounds: lngLatBounds(bounds),
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

  return h(
    "div.map-view-container.main-view.cross-section-map",
    {
      ref: parentRef,
      style: {
        "--cross-section-width": `${pixelSize.width}px`,
        "--cross-section-height": `${pixelSize.height}px`,
      },
    },
    [
      h("div.mapbox-map.map-view", { ref }),
      h(StyleLoadedReporter, { onStyleLoaded: null }),
      children,
    ],
  );
}

function lngLatBounds(bounds: MercatorBBox): maplibre.LngLatBoundsLike {
  const sw = mercator.inverse([bounds[0], bounds[1]]);
  const ne = mercator.inverse([bounds[2], bounds[3]]);
  return [sw, ne];
}

interface TileBoundsResult {
  tiles: MapTile[];
  pixelSize: {
    width: number;
    height: number;
  };
  bounds: MercatorBBox;
  metersPerPixel: number;
}

interface TileComputationOptions {
  metersPerPixel?: number;
  tileSize?: number;
}

type MercatorBBox = [number, number, number, number];

interface MapTile {
  bounds: MercatorBBox;
  pixelSize: {
    width: number;
    height: number;
  };
}

function computeTiledBounds(
  data: CrossSectionData,
  options: TileComputationOptions = {},
): TileBoundsResult {
  const ll: [number, number] = [data.offset_x, data.offset_y];
  const ur: [number, number] = [
    data.offset_x + data.length,
    data.offset_y + 2500,
  ];

  const bounds: MercatorBBox = [...ll, ...ur];

  const { metersPerPixel = 10, tileSize = 1024 } = options;
  const width = ur[0] - ll[0];
  const height = ur[1] - ll[1];

  const pixelWidth = width / metersPerPixel;
  const pixelHeight = height / metersPerPixel;

  const tilesX = Math.ceil(pixelWidth / tileSize);
  const tilesY = Math.ceil(pixelHeight / tileSize);

  // Iterate over tiles in x and y directions
  let sx = 0;
  let sy = 0;
  const tiles: MapTile[] = [];
  for (let x = 0; x < tilesX; x++) {
    sy = 0;
    const tileWidth = sx + tileSize > pixelWidth ? pixelWidth - sx : tileSize;
    for (let y = 0; y < tilesY; y++) {
      const tileHeight =
        sy + tileSize > pixelHeight ? pixelHeight - sy : tileSize;

      const minX = ll[0] + sx * metersPerPixel;
      const minY = ll[1] + sy * metersPerPixel;
      const maxX = minX + tileWidth * metersPerPixel;
      const maxY = minY + tileHeight * metersPerPixel;

      tiles.push({
        bounds: [minX, minY, maxX, maxY],
        pixelSize: {
          width: tileWidth,
          height: tileHeight,
        },
      });

      sy += tileSize;
    }
    sx += tileSize;
  }

  return {
    tiles,
    pixelSize: {
      width: pixelWidth,
      height: pixelHeight,
    },
    bounds,
    metersPerPixel,
  };
}
