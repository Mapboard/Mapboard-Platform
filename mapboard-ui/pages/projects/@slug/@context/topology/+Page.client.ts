import hyper from "@macrostrat/hyper";
import styles from "../map.module.scss";
import { apiDomain, mapboxToken } from "~/settings";
import { FlexBox, useAPIResult } from "@macrostrat/ui-components";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { AnchorButton, Breadcrumbs, Icon, Spinner } from "@blueprintjs/core";
import { buildMapOverlayStyle } from "../style";
import { useMemo } from "react";
import { MapStateProvider, useMapState } from "../state";
import classNames from "classnames";
import { bbox } from "@turf/bbox";
import { MapLoadingButton, DevMapPage } from "@macrostrat/map-interface";
import { MapArea } from "../map";
import { PickerList } from "~/components/list";

const h = hyper.styled(styles);

export function Page() {
  return h(MapStateProvider, h(PageInner));
}

function PageInner() {
  const ctx = useData<Data>();

  const bounds = bbox(ctx.bounds);

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  const activeLayer = useMapState((state) => state.activeLayer);

  const overlayStyle = useMemo(
    () => buildMapOverlayStyle(baseURL, activeLayer),
    [ctx.project_slug, activeLayer],
  );

  return h(
    DevMapPage,
    {
      mapboxToken,
      title: ctx.name,
      overlayStyle,
      bounds,
      //headerElement: h(ContextHeader, ctx),
      baseURL,
    },
    [h(LayerControlPanel, { baseURL })],
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
        headerElement: h(ContextHeader, {
          backLink: `/projects/${ctx.project_slug}/${ctx.slug}`,
          backLinkText: ctx.name,
          name: "Topology",
        }),
      },
      [h(LayerControlPanel, { baseURL })],
    ),
  );
}

function ContextHeader({ backLink, backLinkText, name }) {
  const isOpen = useMapState((state) => state.layerPanelIsOpen);
  const setOpen = useMapState((state) => state.actions.toggleLayerPanel);

  return h(FlexBox, { className: "nav-header" }, [
    h(
      BackButton,
      { href: backLink, className: "back-to-project" },
      backLinkText,
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
