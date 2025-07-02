import { getCSSVariable } from "@macrostrat/color-utils";
import { setGeoJSON } from "@macrostrat/mapbox-utils";
import GeoJSON from "geojson";
import { useMapStyleOperator } from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";

export function BoundsLayer({
  bounds,
  visible = true,
  zoomToBounds = false,
}: {
  bounds: GeoJSON.Geometry;
  visible?: boolean;
  // Zoom to bounds when they change
  zoomToBounds?: boolean;
}) {
  useMapStyleOperator(
    (map) => {
      // Create a GeoJSON source for the bounds
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: bounds,
            properties: {},
          },
        ],
      };

      setGeoJSON(map, "mapboard:map-bounds", geojson);

      const color = getCSSVariable("--text-color") ?? "black";

      const layer = map.getLayer("mapboard:map-bounds");

      if (layer == null) {
        // Add the bounds layer if it doesn't exist
        map.addLayer({
          id: "mapboard:map-bounds",
          type: "line",
          source: "mapboard:map-bounds",
          paint: {
            "line-color": color,
            "line-width": 2,
            "line-opacity": 1,
          },
          layout: {
            visibility: visible ? "visible" : "none",
          },
        });
      }

      // Zoom to the bounds if they are provided
      if (bounds == null || !zoomToBounds) return;

      const zoomBox = bbox(bounds);

      console.log(bounds, zoomBox);
      if (zoomBox == null) return;
      map.fitBounds(zoomBox, { duration: 0, padding: 5 });
    },
    [bounds, zoomToBounds],
  );

  useMapStyleOperator(
    (map) => {
      if (visible) {
        // Show the bounds layer
        map.setLayoutProperty("mapboard:map-bounds", "visibility", "visible");
      } else {
        // Hide the bounds layer
        map.setLayoutProperty("mapboard:map-bounds", "visibility", "none");
      }
    },
    [visible],
  );

  return null; // This component does not render anything visually
}
