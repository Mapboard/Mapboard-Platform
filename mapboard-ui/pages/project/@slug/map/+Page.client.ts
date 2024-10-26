import { DevMapPage } from "@macrostrat/map-interface";
import h from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import { useInDarkMode } from "@macrostrat/ui-components";

export function Page() {
  const inDarkMode = useInDarkMode();
  const style = inDarkMode
    ? "mapbox://styles/jczaplewski/cl5uoqzzq003614o6url9ou9z"
    : "mapbox://styles/jczaplewski/clatdbkw4002q14lov8zx0bm0";
  return h(DevMapPage, { mapboxToken, style });
}
