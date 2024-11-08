import hyper from "@macrostrat/hyper";
import styles from "./map.module.sass";
import { apiDomain, mapboxToken } from "~/settings";
import { FlexBox, FlexCol, useAPIResult } from "@macrostrat/ui-components";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { Breadcrumbs, Spinner } from "@blueprintjs/core";
import { buildMap3DStyle } from "./style";
import { useMemo } from "react";
import { MapStateProvider, useMapState } from "./state";
import classNames from "classnames";
import { bbox } from "@turf/bbox";
import { Card } from "@blueprintjs/core";
import {
  FloatingNavbar,
  MapAreaContainer,
  MapLoadingButton,
  MapView,
} from "@macrostrat/map-interface";
import { MapArea } from "./map";

const h = hyper.styled(styles);

export function Page() {
  return h(MapStateProvider, h(PageInner));
}

function PageInner() {
  const ctx = useData<Data>();

  const bounds = bbox(ctx.bounds);

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}`;

  const activeLayer = useMapState((state) => state.activeLayer);

  const overlayStyle = useMemo(
    () => buildMap3DStyle(baseURL, activeLayer),
    [ctx.project_slug, activeLayer],
  );

  console.log(ctx);

  const headerElement = h(ProjectBreadcrumbs, ctx);
  return h(
    MapArea,
    { mapboxToken, title: ctx.name, overlayStyle, bounds, headerElement },
    [h(LayerControlPanel, { slug: ctx.project_slug })],
  );
}

function ProjectBreadcrumbs({ project_name, project_slug, name }) {
  const items = [
    { href: `/projects/${project_slug}`, text: project_name },
    { text: name },
  ];

  return h(Breadcrumbs, { items });
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
    "ul.layer-list",
    sortedLayers.map((layer) => h(LayerControl, { layer })),
  );
}

function LayerControl({ layer }) {
  const active = useMapState((state) => state.activeLayer);
  const setActive = useMapState((state) => state.actions.setActiveLayer);

  return h(
    "li.layer",
    {
      onClick() {
        setActive(layer.id);
      },
      className: classNames({ active: active === layer.id }),
    },
    [h("span.name", layer.name)],
  );
}
