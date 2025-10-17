import hyper from "@macrostrat/hyper";
import { scaleLinear } from "@visx/scale";
import styles from "./index.module.sass";
import { createElement, useCallback, useMemo, useRef, useState } from "react";

console.log(styles);

const h = hyper.styled(styles);

/**
 * .scalebar-root {
 *   --scalebar-font-family: "Gotham", sans-serif;
 *   --scalebar-font-size: 12px;
 *   --scalebar-color: #888;
 *   --scalebar-background: #fff;
 * }
 */

export type ScaleBarProps = {
  scale: number; // pixels per meter
  width: number; // width in px
  height?: number;
  margin?: number;
  standalone?: boolean;
  color?: string;
  backgroundColor?: string;
  className?: string;
};

function roundToNearest(d: number, i = 1) {
  return Math.round(d / i) * i;
}

function order(d: number) {
  return Math.floor(Math.log10(d));
}

export function Scalebar({
  scale,
  width,
  height = 5,
  strokeWidth = 2,
  margin = 10,
  color,
  backgroundColor,
  className,
}: ScaleBarProps) {
  // Calculate geo size and units
  const initGuess = width * scale;
  const o = order(initGuess);
  const rounder = 5 * Math.pow(10, o - 1);
  let geoSize = roundToNearest(initGuess, rounder);
  let label = "m";
  let unitScalar = 1;
  if (geoSize > 1000) {
    unitScalar = 1000;
    label = "km";
  }

  const [lastLabelXVal, setXVal] = useState(0);

  const ref = useCallback((el) => {
    const bbox = el.getBBox();
    setXVal(bbox.x + bbox.width);
  }, []);

  const barWidthActual = geoSize / scale;

  // visx scale and ticks
  const x = scaleLinear<number>({
    domain: [0, geoSize],
    range: [0, barWidthActual],
    nice: true,
  });
  const ndivs = 5;
  const ticks = x.ticks(ndivs);
  const tickPairs = ticks.slice(0, -1).map((t, i) => [t, ticks[i + 1]]);

  // Estimate unit label offset
  const lastTick = ticks[ticks.length - 1];

  const barWidth = x(lastTick) - x(0);

  let styleVars: Record<string, string> = {};
  if (color != null) {
    styleVars["--scalebar-color"] = color;
  }
  if (backgroundColor != null) {
    styleVars["--scalebar-background"] = backgroundColor;
  }

  const paddingTop = 20;
  const paddingBottom = 5;

  const totalHeight = height + paddingTop + paddingBottom;

  return h(
    SVG,
    {
      style: { ...styleVars, width: lastLabelXVal + 40, height: totalHeight },
      className: `scalebar-root ${className ?? ""}`.trim(),
    },
    [
      h("rect.scalebar-underlay", {
        x: 0,
        y: 0,
        width: lastLabelXVal + 40,
        height: totalHeight,
      }),
      h("g.scale", { transform: "translate(10,20)" }, [
        h("rect.scale-background", {
          width: barWidth,
          height,
          strokeWidth,
        }),
        h(
          "g.scale-overlay",
          tickPairs.map(([a, b], i) =>
            h("rect.scale-box", {
              key: i,
              x: x(a),
              width: x(b) - x(a),
              height,
              className: i % 2 ? "even" : "",
            }),
          ),
        ),
        h(
          "g.tick-labels",
          { ref },
          ticks.map((t, i) =>
            h(
              "text.label",
              {
                key: i,
                x: x(t),
                y: -5,
              },
              t / unitScalar,
            ),
          ),
        ),
        h(
          "text.unit-label",
          {
            x: (lastLabelXVal ?? 0) + 5,
            y: -5,
          },
          label,
        ),
      ]),
    ],
  );
}

function SVG(props) {
  return createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    xmlnsXlink: "http://www.w3.org/1999/xlink",
    ...props,
  });
}
