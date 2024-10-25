import { DevMapPage } from "@macrostrat/map-interface";
import h from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";

export function Page() {
  return h(DevMapPage, { mapboxToken });
}
