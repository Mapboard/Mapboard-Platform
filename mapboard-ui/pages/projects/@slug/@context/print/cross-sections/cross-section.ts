import type { CrossSectionData, PiercingPoint } from "./cross-section-data";
import React, { useMemo } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import {
  computeTiledBounds,
  MercatorBBox,
  TiledMapArea,
  getLineOverallAngle,
} from "~/maplibre";
import { scaleLinear } from "@visx/scale";
import { buildCrossSectionStyle } from "./style";
import { expandInnerSize } from "@macrostrat/ui-components";
import styles from "./+Page.client.module.sass";
import hyper from "@macrostrat/hyper";

const h = hyper.styled(styles);

export function CrossSectionsList({
  data,
  ref,
  elevationRange,
  metersPerPixel,
  className,
}: {
  data: CrossSectionData[];
  ref?: React.Ref<HTMLElement>;
  className?: string;
} & CrossSectionOpts) {
  return h(
    "div.cross-sections",
    { ref, className },
    data.map((ctx) => {
      return h(CrossSection, {
        key: ctx.id,
        data: ctx,
        elevationRange,
        metersPerPixel,
      });
    }),
  );
}

interface CrossSectionOpts {
  elevationRange?: [number, number];
  metersPerPixel?: number;
}

export function CrossSection(
  props: {
    data: CrossSectionData;
  } & CrossSectionOpts,
) {
  const { data, elevationRange, metersPerPixel } = props;

  return h("div.cross-section", [
    h("div.cross-section-map-container", [
      h(
        CrossSectionMapView,
        {
          data,
          elevationRange,
          metersPerPixel,
        },
        [
          h("h2.cross-section-title", data.name),
          h("h3.cross-section-title.end-title", data.name + "'"),
          //h(Endpoints, { line: data.geometry }),
        ],
      ),
    ]),
  ]);
}

interface MapViewProps extends CrossSectionOpts {
  data: CrossSectionData;
  children?: React.ReactNode;
  className?: string;
}

function Endpoints({ line }: { line: GeoJSON.LineString }) {
  const endpoints = getEndpointCardinalDirections(line);
  return h("div.endpoints", [
    h("div.endpoint.start", endpoints[0]),
    h("div.endpoint.end", endpoints[1]),
  ]);
}

export function CrossSectionMapView(props: MapViewProps) {
  const {
    data,
    children,
    className,
    elevationRange = [500, 2200],
    metersPerPixel = 10,
    ...rest
  } = props;

  let domain = document.location.origin;
  const { project_slug, slug } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  const tileBounds = useMemo(() => {
    const ll: [number, number] = [
      data.offset_x,
      data.offset_y + elevationRange[0],
    ];
    const ur: [number, number] = [
      data.offset_x + data.length,
      data.offset_y + elevationRange[1],
    ];

    const bounds: MercatorBBox = [...ll, ...ur];

    return computeTiledBounds(bounds, {
      metersPerPixel,
    });
  }, [data]);

  const { bounds, pixelSize } = tileBounds;

  const elevationScale = scaleLinear({
    domain: [bounds[1] - data.offset_y, bounds[3] - data.offset_y],
    range: [pixelSize.height, 0],
    clamp: true,
  });

  const showDistanceOffset = false;
  let offset = 0;
  if (showDistanceOffset) {
    offset = data.offset_x;
  }

  const distanceScale = scaleLinear({
    domain: [offset, data.length + offset],
    range: [0, pixelSize.width],
    clamp: true,
  });

  // Not sure why this is needed, really, but it prevents double rendering
  const style = useMemo(() => {
    return buildCrossSectionStyle(baseURL);
  }, [baseURL]);

  const sizeOpts = expandInnerSize({
    innerHeight: pixelSize.height,
    innerWidth: pixelSize.width,
    padding: 40,
    paddingTop: 20,
    paddingLeft: 60,
  });

  const { width, height, paddingTop, paddingLeft } = sizeOpts;

  return h(
    TiledMapArea,
    {
      className: "cross-section-map",
      tileBounds,
      style,
      ...sizeOpts,
    },
    [
      h(PiercingPoints, {
        data: data.piercing_points ?? [],
        scale: distanceScale,
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
      children,
    ],
  );
}

function PiercingPoints({
  data,
  scale,
}: {
  data: PiercingPoint[];
  scale: any;
}) {
  if (data == null || data.length === 0) return null;
  return h(
    "div.piercing-points",
    data.map((pt) => {
      return h(
        "div.piercing-point",
        {
          style: {
            left: scale(pt.distance),
          },
        },
        [h("div.name", pt.other_name), h("div.tick")],
      );
    }),
  );
}

function getEndpointCardinalDirections(
  linestring: GeoJSON.LineString,
): [string, string] {
  // Compute the cardinal directions of each endpoint of a section line

  const angle = getLineOverallAngle(linestring);
  if (angle == null) return ["?", "?"];

  const domains = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const correctedAngle = (angle + 360) % 360;
  // Each domain covers 45 degrees, centered on the cardinal direction

  const index = Math.floor((correctedAngle + 22.5) / 45);

  const endDir = domains[index];
  const startDir = domains[(index + 4) % domains.length];
  return [startDir, endDir];
}

function ElevationAxis({ scale, left = 0 }) {
  const tickLength = 5;
  const halfHeight = (scale.range()[1] - scale.range()[0]) / 2;
  const x = left - tickLength - 20;
  const y = -halfHeight;
  return h("g.elevation-axis", [
    h(
      "text",
      {
        style: {
          textAnchor: "middle",
        },
        fontSize: "var(--axis-label-font-size, 12px)",
        transform: `translate(${x} ${y}) rotate(-90)`,
      },
      "Elevation (m)",
    ),
    h(AxisLeft, {
      scale,
      numTicks: 3,
      left,
      tickLength,
      tickLabelProps: {
        angle: -90,
        textAnchor: "middle",
        fontSize: "var(--axis-tick-font-size, 10px)",
      },
    }),
  ]);
}

function DistanceAxis({ scale, top = 0 }) {
  // Ticks every 2 km regardless of length
  const dx = scale.domain()[1] - scale.domain()[0];
  const numTicks = Math.ceil(dx / 1000);

  // only label every 5th km

  return h(AxisBottom, {
    scale,
    numTicks,
    top,
    tickLabelProps: {
      fontSize: "var(--axis-tick-font-size, 10px)",
    },
    tickFormat(val) {
      if (val % 5000 === 0) {
        return `${val / 1000} km`;
      }
      return "";
    },
  });
}
