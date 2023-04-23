import h from "@macrostrat/hyper";
import { DevMapPage } from "@macrostrat/map-interface";
import { mapboxToken, sourceURL } from "../config";
import "mapbox-gl/dist/mapbox-gl.css";

const map3DStyle = {
  version: 8,
  sources: {
    mapboard: {
      type: "vector",
      tiles: [sourceURL + "/features/tile/{z}/{x}/{y}.pbf"],
      volatile: true,
    },
  },
  layers: [
    {
      id: "polygons",
      type: "fill",
      source: "mapboard",
      "source-layer": "polygons",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.5,
      },
    },
    {
      id: "lines",
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": "#000000",
        "line-width": 1.5,
      },
    },
  ],
};

export function Inspector() {
  return h(DevMapPage, {
    mapboxToken,
    overlayStyle: map3DStyle,
    mapPosition: {
      camera: {
        lat: -24,
        lng: 16.5,
        altitude: 150000,
      },
    },
    //style,
  });
}
