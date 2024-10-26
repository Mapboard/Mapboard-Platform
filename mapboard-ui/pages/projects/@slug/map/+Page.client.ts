import { DevMapPage } from "@macrostrat/map-interface";
import h from "@macrostrat/hyper";
import { apiDomain, mapboxToken } from "~/settings";
import { useAPIResult, useInDarkMode } from "@macrostrat/ui-components";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { Spinner } from "@blueprintjs/core";
import { buildMap3DStyle } from "./style";
import { useMemo } from "react";

export function Page() {
  const inDarkMode = useInDarkMode();
  const project = useData<Data>();

  const style = inDarkMode
    ? "mapbox://styles/jczaplewski/cl5uoqzzq003614o6url9ou9z"
    : "mapbox://styles/jczaplewski/clatdbkw4002q14lov8zx0bm0";

  const baseURL = `${apiDomain}/api/project/${project.slug}`;

  const overlayStyle = useMemo(() => buildMap3DStyle(baseURL), [project.slug]);

  return h(
    DevMapPage,
    { mapboxToken, style, title: project.title, overlayStyle },
    h(LayerControlPanel, { slug: project.slug }),
  );
}

function LayerControlPanel({ slug }) {
  return h("div.layer-control-panel", [
    h("h2", "Layers"),
    h(LayerList, { slug }),
  ]);
}

function LayerList({ slug }) {
  const layers: any[] = useAPIResult(
    apiDomain + `/api/project/${slug}/map-layers`,
  );

  if (layers == null) {
    return h(Spinner);
  }

  const sortedLayers = layers.sort((a, b) => {
    return a.position - b.position;
  });

  return h(
    "ul",
    sortedLayers.map((layer) => h("li", layer.name)),
  );
}
