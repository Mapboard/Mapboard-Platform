import h from "@macrostrat/hyper";
import { DevMapPage } from "@macrostrat/map-interface";
import { mapboxToken } from "../config";
import "mapbox-gl/dist/mapbox-gl.css";

export function Inspector() {
  return h(DevMapPage, {
    mapboxToken,
  });
}
