/* Map tool for box selection
 *
 * https://docs.mapbox.com/mapbox-gl-js/example/using-box-queryrenderedfeatures/
 *  */

import { useEffect, useRef, useState } from "react";
import { useMapRef } from "@macrostrat/mapbox-react";
import mapboxgl from "mapbox-gl";

export function BoxSelectionManager() {
  const ref = useMapRef();

  useEffect(() => {
    const map = ref.current;
    if (map == null) return;

    // Disable default box zooming.
    map.boxZoom.disable();

    // Create a popup, but don't add it to the map yet.
    const popup = new mapboxgl.Popup({
      closeButton: false,
    });

    map.on("load", () => {
      const canvas = map.getCanvasContainer();

      // Variable to hold the starting xy coordinates
      // when `mousedown` occured.
      let start;

      // Variable to hold the current xy coordinates
      // when `mousemove` or `mouseup` occurs.
      let current;

      // Variable for the draw box element.
      let box;

      // Add a custom vector tileset source. The tileset used in
      // this example contains a feature for every county in the U.S.
      // Each county contains four properties. For example:
      // {
      //     COUNTY: "Uintah County",
      //     FIPS: 49047,
      //     median-income: 62363,
      //     population: 34576
      // }
      map.addSource("counties", {
        type: "vector",
        url: "mapbox://mapbox.82pkq93d",
      });

      map.addLayer(
        {
          id: "counties",
          type: "fill",
          source: "counties",
          "source-layer": "original",
          paint: {
            "fill-outline-color": "rgba(0,0,0,0.1)",
            "fill-color": "rgba(0,0,0,0.1)",
          },
        },
        // Place polygons under labels, roads and buildings.
        "building",
      );

      map.addLayer(
        {
          id: "counties-highlighted",
          type: "fill",
          source: "counties",
          "source-layer": "original",
          paint: {
            "fill-outline-color": "#484896",
            "fill-color": "#6e599f",
            "fill-opacity": 0.75,
          },
          filter: ["in", "FIPS", ""],
        },
        // Place polygons under labels, roads and buildings.
        "building",
      );

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
          box.classList.add("boxdraw");
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
          const features = map.queryRenderedFeatures(bbox, {
            layers: ["counties"],
          });

          if (features.length >= 1000) {
            return window.alert("Select a smaller number of features");
          }

          // Run through the selected features and set a filter
          // to match features with unique FIPS codes to activate
          // the `counties-highlighted` layer.
          const fips = features.map((feature) => feature.properties.FIPS);
          map.setFilter("counties-highlighted", ["in", "FIPS", ...fips]);
        }

        map.dragPan.enable();
      }

      map.on("mousemove", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["counties-highlighted"],
        });

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = features.length ? "pointer" : "";

        if (!features.length) {
          popup.remove();
          return;
        }

        popup
          .setLngLat(e.lngLat)
          .setText(features[0].properties.COUNTY)
          .addTo(map);
      });
    });
  }, []);

  return null;
}
