import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import { apiDomain, mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { AnchorButton, FormGroup, Spinner } from "@blueprintjs/core";
import {
  BasemapType,
  MapLayer,
  MapStateProvider,
  useMapActions,
  useMapState,
} from "./state";
import { bbox } from "@turf/bbox";
import { MapLoadingButton } from "@macrostrat/map-interface";
import { MapArea } from "./map";
import { ToasterContext } from "@macrostrat/ui-components";
import { ItemSelect } from "@macrostrat/form-components";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    ToasterContext,
    h(MapStateProvider, { baseURL }, h(PageInner, { baseURL, context: ctx })),
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
    h("div.title-block", [
      h(
        BackButton,
        { href: `/projects/${project_slug}`, className: "back-to-project" },
        project_name,
      ),
      h("h2", name),
    ]),
    h("div.settings-toggle", [
      h(MapLoadingButton, {
        large: true,
        icon: "cog",
        active: isOpen,
        className: "layer-toggle",
        onClick: () => setOpen(!isOpen),
      }),
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
  return h("div.layer-control-panel", [h(LayerList), h(BasemapList)]);
}

function BasemapList() {
  type BasemapItem = { id: BasemapType; name: string };
  const items: BasemapItem[] = [
    { id: BasemapType.Basic, name: "Standard" },
    { id: BasemapType.Satellite, name: "Satellite" },
    { id: BasemapType.Terrain, name: "Terrain" },
  ];

  const setBasemap = useMapActions((actions) => actions.setBaseMap);
  const active = useMapState((state) => state.baseMap);
  const selectedItem = items.find((d) => d.id == active) ?? null;

  return h(
    FormGroup,
    { label: "Basemap", inline: true, fill: true },
    h(ItemSelect<BasemapItem>, {
      items,
      selectedItem,
      onSelectItem: (item) => {
        setBasemap(item.id);
      },
      label: "basemap",
      icon: "layers",
      fill: false,
    }),
  );
}

function LayerList() {
  const layers = useMapState((state) => state.mapLayers);
  const active = useMapState((state) => state.activeLayer);
  const setActive = useMapState((state) => state.actions.setActiveLayer);

  const selectedItem = layers?.find((d) => d.id == active) ?? null;

  if (layers == null) {
    return h(Spinner);
  }

  const sortedLayers = layers.sort((a, b) => {
    return a.position - b.position;
  });

  return h(
    FormGroup,
    { label: "Layers", inline: true, fill: true },
    h(ItemSelect<MapLayer>, {
      items: sortedLayers,
      selectedItem,
      onSelectItem: (layer) => {
        setActive(layer.id);
      },
      label: "layer",
      icon: "layers",
      fill: false,
    }),
  );
}
