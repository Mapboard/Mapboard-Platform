import { useData } from "vike-react/useData";
import type { CrossSectionData } from "./+data";
import hyper from "@macrostrat/hyper";

import React, { useEffect, useMemo, useRef } from "react";
import styles from "./+Page.client.module.sass";
import { setupStyleImageManager } from "../../@context/style/pattern-manager";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SphericalMercator } from "@mapbox/sphericalmercator";

import { buildCrossSectionStyle } from "./style";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleLinear } from "@visx/scale";
import { expandInnerSize } from "@macrostrat/ui-components";
import html2pdf from "html2pdf.js";
import { Button } from "@blueprintjs/core";

const h = hyper.styled(styles);

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export function Page() {
  const crossSections = useData<CrossSectionData[]>() ?? [];

  const ref = useRef<HTMLDivElement>(null);

  return h("div.main", [
    h("div.controls", [
      h(PrintButton, { elementRef: ref, filename: "cross-sections.pdf" }),
    ]),
    h(
      "div.cross-sections",
      { ref },
      crossSections.map((ctx) => {
        return h(CrossSection, { key: ctx.id, data: ctx });
      }),
    ),
  ]);
}

function PrintButton({
  elementRef,
  disabled,
  filename,
}: {
  elementRef: React.RefObject<HTMLElement>;
  filename?: string;
  disabled?: boolean;
}) {
  const handlePrint = () => {
    const el = elementRef.current;
    if (el == null) return;

    const size = el.getBoundingClientRect();
    const orientation = size.width > size.height ? "landscape" : "portrait";

    const ppi = 96 * 2;

    const width = size.width / 96; // Convert from px to in (assuming 96 ppi for screen)
    const height = size.height / 96;

    html2pdf(el, {
      filename,
      html2canvas: {
        scale: ppi / 96,
      },
      jsPDF: {
        orientation,
        unit: "in",
        format: [width, height],
      },
    });
  };
  return h(Button, { icon: "print", disabled: disabled, onClick: handlePrint });
}

function CrossSection(props: { data: CrossSectionData }) {
  const { data } = props;

  return h("div.cross-section", {}, [
    h("h2.cross-section-title", data.name),
    h("div.cross-section-map-container", [
      h(CrossSectionMapView, {
        data,
      }),
    ]),
  ]);
}

interface MapViewProps {
  data: CrossSectionData;
  children?: React.ReactNode;
  className?: string;
}

export function CrossSectionMapView(props: MapViewProps) {
  const { data, children, className, ...rest } = props;

  const ref = useRef<HTMLDivElement>();

  console.log("Cross section", data);
  let domain = document.location.origin;
  const { project_slug, slug } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  const tileBounds = useMemo(() => {
    return computeTiledBounds(data, {
      metersPerPixel: 15,
    });
  }, [data]);

  const { bounds, metersPerPixel, pixelSize } = tileBounds;

  const elevationScale = scaleLinear({
    domain: [bounds[1] - data.offset_y, bounds[3] - data.offset_y],
    range: [pixelSize.height, 0],
    clamp: true,
  });

  const distanceScale = scaleLinear({
    domain: [-data.offset_x, data.length - data.offset_x].map((d) => d / 1000),
    range: [0, pixelSize.width],
    clamp: true,
  });

  // Not sure why this is needed, really, but it prevents double rendering
  const renderCounter = useRef(0);
  useEffect(() => {
    /** Manager to update map style */
    if (ref.current == null) return;
    renderCounter.current += 1;
    if (renderCounter.current > 1) return;
    // Compute tiled bounds

    const baseStyle = buildCrossSectionStyle(baseURL);
    renderTiledMap(ref.current, tileBounds, baseStyle).then(() => {});
  }, [ref.current, tileBounds]);

  const { width, height, paddingTop, paddingLeft } = expandInnerSize({
    innerHeight: pixelSize.height,
    innerWidth: pixelSize.width,
    padding: 40,
    paddingLeft: 60,
  });

  return h(
    "div.map-view-container.main-view.cross-section-map",
    {
      style: { width: width + "px", height: height + "px" },
    },
    [
      h("div.mapbox-map.map-view", {
        ref,
        style: {
          paddingTop: paddingTop + "px",
          paddingLeft: paddingLeft + "px",
        },
      }),
      h("svg.scales", { width, height }, [
        h(
          "g.axis-group",
          { transform: `translate(${paddingLeft} ${paddingTop})` },
          [
            h(ElevationAxis, { scale: elevationScale, left: -5 }),
            h(DistanceAxis, {
              scale: distanceScale,
              top: pixelSize.height + 5,
            }),
          ],
        ),
      ]),
    ],
  );
}

function ElevationAxis({ scale, left = 0 }) {
  const tickLength = 5;
  return h("g.elevation-axis", [
    h(
      "text",
      {
        x: left - tickLength,
        y: -15,
        style: {
          textAnchor: "middle",
        },
        fontSize: 12,
      },
      "Elevation (m)",
    ),
    h(AxisLeft, { scale, numTicks: 4, left, tickLength }),
  ]);
}

function DistanceAxis({ scale, top = 0 }) {
  // Ticks every 2 km regardless of length
  const dx = scale.domain()[1] - scale.domain()[0];
  const numTicks = Math.ceil(dx);

  // only label every 5th km

  return h(AxisBottom, {
    scale,
    numTicks,
    top,
    tickComponent: DistanceTick,
  });
}

function DistanceTick(props) {
  const { formattedValue, x, y } = props;
  const val = Number(formattedValue);
  if (val % 5 !== 0) return null;
  return h(
    "g",
    { transform: `translate(${x} ${y})` },
    h(
      "text",
      {
        style: { textAnchor: "middle" },
        fontSize: 10,
        dy: "0.5em",
      },
      `${val} km`,
    ),
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
  pixelOffset: {
    top: number;
    left: number;
  };
}

async function renderTiledMap(
  element: HTMLDivElement,
  config: TileBoundsResult,
  style: any,
) {
  const { tiles, bounds } = config;

  const container = document.createElement("div");
  container.className = "map-container";
  element.appendChild(container);

  const map = new maplibre.Map({
    container,
    bounds: lngLatBounds(bounds),
    style,
    trackResize: false,
    attributionControl: false,
    interactive: false,
    maxZoom: 22,
    pixelRatio: 4,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    boxZoom: false,
  });
  setupStyleImageManager(map);

  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";
  element.appendChild(imageContainer);

  imageContainer.style.position = "relative";
  imageContainer.style.width = config.pixelSize.width + "px";
  imageContainer.style.height = config.pixelSize.height + "px";

  for await (const tile of tiles) {
    const { bounds, pixelSize } = tile;
    container.style.position = "absolute";
    setSize(container, tile);
    map.resize();
    map.fitBounds(lngLatBounds(bounds), { duration: 0, padding: 0 });
    await new Promise((resolve) => {
      map.once("idle", () => {
        resolve(null);
      });
    });
    const img = new Image();
    imageContainer.appendChild(img);
    setSize(img, tile);
    const dataUrl = map.getCanvas().toDataURL("image/png");
    img.src = dataUrl;

    await new Promise((resolve) => {
      img.onload = () => resolve(null);
    });
  }

  // Clean up
  map.remove();
  container.remove();
}

function setSize(element: HTMLDivElement, config: MapTile) {
  const { pixelSize } = config;
  element.style.width = pixelSize.width + "px";
  element.style.height = pixelSize.height + "px";
  element.style.position = "absolute";
  element.style.top = config.pixelOffset.top + "px";
  element.style.left = config.pixelOffset.left + "px";
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
        pixelOffset: {
          left: sx,
          top: sy,
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
