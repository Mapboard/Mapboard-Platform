import type { CrossSectionData, PiercingPoint } from "./cross-section-data";
import React, { useMemo } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { computeTiledBounds, MercatorBBox, TiledMapArea } from "~/maplibre";
import { scaleLinear } from "@visx/scale";
import { buildCrossSectionStyle } from "./style";
import { expandInnerSize } from "@macrostrat/ui-components";
import styles from "./+Page.client.module.sass";
import hyper from "@macrostrat/hyper";

const h = hyper.styled(styles);

export function CrossSectionsList({
  data,
  ref,
}: {
  data: CrossSectionData[];
  ref: React.Ref<HTMLElement>;
}) {
  return h(
    "div.cross-sections",
    { ref },
    data.map((ctx) => {
      return h(CrossSection, { key: ctx.id, data: ctx });
    }),
  );
}

export function CrossSection(props: { data: CrossSectionData }) {
  const { data } = props;

  console.log(data);

  return h("div.cross-section", [
    h("div.cross-section-map-container", [
      h(
        CrossSectionMapView,
        {
          data,
        },
        [
          h("h2.cross-section-title", data.name),
          h("h3.cross-section-title.end-title", data.name + "'"),
        ],
      ),
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

  let domain = document.location.origin;
  const { project_slug, slug } = data;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  const tileBounds = useMemo(() => {
    const ll: [number, number] = [data.offset_x, data.offset_y + 500];
    const ur: [number, number] = [
      data.offset_x + data.length,
      data.offset_y + 2200,
    ];

    const bounds: MercatorBBox = [...ll, ...ur];

    return computeTiledBounds(bounds, {
      metersPerPixel: 15,
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
        [h("div.name", pt.other_name)],
      );
    }),
  );
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
        fontSize: 12,
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
    tickFormat(val) {
      if (val % 5000 === 0) {
        return `${val / 1000} km`;
      }
      return "";
    },
  });
}
