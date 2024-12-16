import hyper from "@macrostrat/hyper";
import styles from "./map.module.sass";
import { apiDomain, mapboxToken } from "~/settings";
import { useAPIResult } from "@macrostrat/ui-components";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { AnchorButton, Breadcrumbs, Icon, Spinner } from "@blueprintjs/core";
import { buildMap3DStyle } from "./style";
import { useMemo } from "react";
import { MapStateProvider, useMapState } from "./state";
import classNames from "classnames";
import { bbox } from "@turf/bbox";
import { MapLoadingButton, MapView } from "@macrostrat/map-interface";
import { MapArea } from "./map";
import { PickerList } from "~/components/list";
import { BoxSelectionManager } from "./_tools";

const h = hyper.styled(styles);

export function Page() {
  return h(MapStateProvider, h(PageInner));
}

function PageInner() {
  const ctx = useData<Data>();

  let bounds = null;
  // We might not have any bounds yet, though this should probably be required...
  if (ctx.bounds) {
    bounds = bbox(ctx.bounds);
  }

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  const activeLayer = useMapState((state) => state.activeLayer);

  const overlayStyle = useMemo(
    () => buildMap3DStyle(baseURL, activeLayer),
    [ctx.project_slug, activeLayer],
  );

  return h(
    "div.map-viewer",
    h(
      MapArea,
      {
        mapboxToken,
        title: ctx.name,
        overlayStyle,
        bounds,
        headerElement: h(ContextHeader, ctx),
      },
      [h(LayerControlPanel, { baseURL }), h(BoxSelectionManager)],
    ),
  );
}

function ContextHeader({ project_name, project_slug, name }) {
  const isOpen = useMapState((state) => state.layerPanelIsOpen);
  const setOpen = useMapState((state) => state.actions.toggleLayerPanel);

  return h("div.nav-header", [
    h(
      BackButton,
      { href: `/projects/${project_slug}`, className: "back-to-project" },
      project_name,
    ),
    h("div.title-row", [
      h(MapLoadingButton, {
        large: false,
        icon: "layers",
        active: isOpen,
        className: "layer-toggle",
        onClick: () => setOpen(!isOpen),
      }),
      h("h2", name),
    ]),
  ]);
}

function BackButton({ href, children, className }) {
  return h(
    AnchorButton,
    { minimal: true, href, icon: "arrow-left", small: true, className },
    children,
  );
}

function LayerControlPanel({ baseURL }) {
  return h("div.layer-control-panel", [
    h("h2", "Layers"),
    h(LayerList, { baseURL }),
  ]);
}

function LayerList({ baseURL }) {
  const layers: any[] = useAPIResult(baseURL + "/map-layers");

  if (layers == null) {
    return h(Spinner);
  }

  const sortedLayers = layers.sort((a, b) => {
    return a.position - b.position;
  });

  return h(
    PickerList,
    { className: "layer-list" },
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
