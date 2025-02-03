/* Map tool for box selection
 *
 * https://docs.mapbox.com/mapbox-gl-js/example/using-box-queryrenderedfeatures/
 *  */

import { useMapStyleOperator } from "@macrostrat/mapbox-react";
import styles from "./index.module.sass";
import mapboxgl from "mapbox-gl";
import hyper from "@macrostrat/hyper";
import { renderToString } from "react-dom/server";
import { useMapActions, useMapState } from "../state";

const h = hyper.styled(styles);

type BoxSelectionProps = {
  layer: string;
};

export function buildSelectionLayers(color: string = "#ff0000") {
  return [
    {
      id: "lines-highlighted",
      type: "line",
      source: "mapboard_line",
      "source-layer": "lines",
      paint: {
        "line-color": color,
        "line-width": 3,
        "line-opacity": 0.75,
      },
      filter: ["in", "id", ""],
    },
    {
      id: "lines-endpoints-highlighted",
      type: "circle",
      source: "mapboard_line",
      "source-layer": "endpoints",
      paint: {
        "circle-color": color,
        "circle-radius": 3,
      },
      filter: ["in", "id", ""],
    },
  ];
}

export function BoxSelectionManager(props: BoxSelectionProps) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const selectFeatures = useMapActions((actions) => actions.selectFeatures);
  const selectedFeatures = useMapState((state) => state.selection);

  useMapStyleOperator(
    (map) => {
      if (map == null) return;
      const fips = selectedFeatures?.lines ?? [];
      map.setFilter("lines-highlighted", ["in", "id", ...fips]);
      map.setFilter("lines-endpoints-highlighted", ["in", "id", ...fips]);
    },
    [selectedFeatures],
  );

  useMapStyleOperator(
    (map) => {
      if (map == null) return;

      // Disable default box zooming.
      map.boxZoom.disable();

      // Create a popup, but don't add it to the map yet.
      const popup = new mapboxgl.Popup({
        closeButton: false,
      });

      const canvas = map.getCanvasContainer();

      // Variable to hold the starting xy coordinates
      // when `mousedown` occured.
      let start;

      // Variable to hold the current xy coordinates
      // when `mousemove` or `mouseup` occurs.
      let current;

      // Variable for the draw box element.
      let box;

      // Set `true` to dispatch the event before other functions
      // call it. This is necessary for disabling the default map
      // dragging behaviour.
      canvas.addEventListener("mousedown", mouseDown, true);

      // Return the xy coordinates of the mouse position
      function mousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return new mapboxgl.Point(
          e.clientX - rect.left - canvas.clientLeft,
          e.clientY - rect.top - canvas.clientTop,
        );
      }

      function mouseDown(e) {
        // Continue the rest of the function if the shiftkey is pressed.
        if (!(e.shiftKey && e.button === 0)) return;

        // Disable default drag zooming when the shift key is held down.
        map.dragPan.disable();

        // Call functions for the following events
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("keydown", onKeyDown);

        // Capture the first xy coordinates
        start = mousePos(e);
      }

      function onMouseMove(e) {
        // Capture the ongoing xy coordinates
        current = mousePos(e);

        // Append the box element if it doesnt exist
        if (!box) {
          box = document.createElement("div");
          box.classList.add(styles["box-draw"]);
          canvas.appendChild(box);
        }

        const minX = Math.min(start.x, current.x),
          maxX = Math.max(start.x, current.x),
          minY = Math.min(start.y, current.y),
          maxY = Math.max(start.y, current.y);

        // Adjust width and xy position of the box element ongoing
        const pos = `translate(${minX}px, ${minY}px)`;
        box.style.transform = pos;
        box.style.width = maxX - minX + "px";
        box.style.height = maxY - minY + "px";
      }

      function onMouseUp(e) {
        // Capture xy coordinates
        finish([start, mousePos(e)]);
      }

      function onKeyDown(e) {
        // If the ESC key is pressed
        if (e.keyCode === 27) finish();
      }

      function finish(bbox) {
        // Remove these events now that finish has been called.
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("mouseup", onMouseUp);

        if (box) {
          box.parentNode.removeChild(box);
          box = null;
        }

        // If bbox exists. use this value as the argument for `queryRenderedFeatures`
        if (bbox) {
          let filter = undefined;
          if (activeLayer) {
            filter = ["==", "map_layer", activeLayer];
          }

          const features = map.queryRenderedFeatures(bbox, {
            layers: ["lines"],
            filter,
          });

          if (features.length >= 1000) {
            return window.alert("Select a smaller number of features");
          }

          // Run through the selected features and set a filter
          // to match features with unique FIPS codes to activate
          // the `counties-highlighted` layer.
          const fips = features.map((feature) => feature.properties.id);

          selectFeatures({ lines: fips });
        }

        map.dragPan.enable();
      }

      const listener = (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["lines-highlighted"],
        });

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = features.length ? "pointer" : "";

        if (!features.length) {
          popup.remove();
          return;
        }

        const f: any = features[0].properties;

        // render html with react
        const _html = h("div.map-popover", [
          h("h3", f.id),
          h(DataField, { label: "Map layer", value: f.map_layer }),
          h(DataField, { label: "Type", value: f.type }),
        ]);
        const html = renderToString(_html);
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      };

      map.on("mousemove", listener);

      return () => {
        map.off("mousemove", listener);
      };
    },
    [activeLayer],
  );

  return null;
}

function DataField({ label, value }) {
  return h("div.data-field", [h("span.label", label), h("span.value", value)]);
}
