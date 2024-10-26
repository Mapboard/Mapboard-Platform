import h from "@macrostrat/hyper";
import { DevMapPage } from "@macrostrat/map-interface";
import { useAPIResult } from "@macrostrat/ui-components";
import { mapboxToken, sourceURL } from "../config";
import "mapbox-gl/dist/mapbox-gl.css";

const map3DStyle = {
  version: 8,
  sources: {
    mapboard_polygon: {
      type: "vector",
      tiles: [sourceURL + "/polygon/tile/{z}/{x}/{y}"],
      volatile: true,
    },
    mapboard_line: {
      type: "vector",
      tiles: [sourceURL + "/line/tile/{z}/{x}/{y}"],
      volatile: true,
    },
  },
  layers: [
    {
      id: "polygons",
      type: "fill",
      source: "mapboard_polygon",
      "source-layer": "polygons",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.5,
      },
    },
    {
      id: "lines",
      type: "line",
      source: "mapboard_line",
      "source-layer": "lines",
      paint: {
        "line-color": "#000000",
        "line-width": 1.5,
      },
    },
    {
      id: "points",
      type: "circle",
      source: "mapboard_line",
      "source-layer": "endpoints",
      paint: {
        "circle-color": "#000000",
        "circle-radius": 1,
      },
    },
  ],
};

export function Inspector() {
  const meta = useAPIResult("/meta");
  if (meta == null) return null;

  const bounds = meta.projectBounds ?? [-135, 60, -132, 67];

  // Get camera params
  const camera = {
    lat: (bounds[1] + bounds[3]) / 2,
    lng: (bounds[0] + bounds[2]) / 2,
    altitude: 150000,
  };

  return h(DevMapPage, {
    mapboxToken,
    overlayStyle: map3DStyle,
    mapPosition: { camera },
    //style,
  });
}
