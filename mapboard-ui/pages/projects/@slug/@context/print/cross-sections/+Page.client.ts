import { useData } from "vike-react/useData";
import type { CrossSectionData, PiercingPoint } from "./+data";
import hyper from "@macrostrat/hyper";

import React, { useEffect, useMemo, useRef } from "react";
import styles from "./+Page.client.module.sass";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildCrossSectionStyle } from "./style";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleLinear } from "@visx/scale";
import { expandInnerSize } from "@macrostrat/ui-components";
import html2pdf from "html2pdf.js";
import { Button } from "@blueprintjs/core";
import { computeTiledBounds, MercatorBBox, renderTiledMap } from "~/maplibre";

const h = hyper.styled(styles);

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
      style: {
        width: width + "px",
        height: height + "px",
        "--padding-top": paddingTop + "px",
        "--padding-left": paddingLeft + "px",
        "--inner-height": pixelSize.height + "px",
      },
    },
    [
      h(PiercingPoints, {
        data: data.piercing_points ?? [],
        scale: distanceScale,
      }),
      h("div.mapbox-map.map-view", {
        ref,
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
