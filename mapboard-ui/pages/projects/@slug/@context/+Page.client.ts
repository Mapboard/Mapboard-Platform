import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import { apiDomain, mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { AnchorButton, Spinner } from "@blueprintjs/core";
import { BasemapType, MapStateProvider, useMapState } from "./state";
import classNames from "classnames";
import { bbox } from "@turf/bbox";
import { MapLoadingButton, MapView } from "@macrostrat/map-interface";
import { MapArea } from "./map";
import { PickerList } from "~/components/list";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    MapStateProvider,
    { baseURL },
    h(PageInner, { baseURL, context: ctx }),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const isMapContext = ctx.type === "map";

  let bounds = null;
  // We might not have any bounds yet, though this should probably be required...
  if (ctx.bounds) {
    bounds = bbox(ctx.bounds);
  }

  return h(
    "div.map-viewer",
    h(
      MapArea,
      {
        mapboxToken,
        title: ctx.name,
        baseURL,
        bounds,
        headerElement: h(ContextHeader, ctx),
        isMapView: isMapContext,
      },
      [h(LayerControlPanel)],
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

function LayerControlPanel() {
  return h("div.layer-control-panel", [
    h("h2", "Layers"),
    h(LayerList),
    h(BasemapList),
  ]);
}

function BasemapList() {
  return h(PickerList, { className: "layer-list basemap-list" }, [
    h(BasemapButton, { basemap: BasemapType.Basic, name: "Standard" }),
    h(BasemapButton, { basemap: BasemapType.Satellite, name: "Satellite" }),
    h(BasemapButton, { basemap: BasemapType.Terrain, name: "Terrain" }),
  ]);
}

function BasemapButton({ basemap, name }: { basemap: BasemapType }) {
  const active = useMapState((state) => state.baseMap);
  const setBasemap = useMapState((state) => state.actions.setBaseMap);
  return h(
    "li.layer",
    {
      onClick() {
        setBasemap(basemap);
      },
      className: classNames({ active: active === basemap }),
    },
    [h("span.name", name)],
  );
}

function LayerList() {
  const layers = useMapState((state) => state.mapLayers);

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
