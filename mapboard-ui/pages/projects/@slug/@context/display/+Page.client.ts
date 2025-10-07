import hyper from "@macrostrat/hyper";
import styles from "../map.module.scss";
import { mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider, useMapState } from "../state";
import { bbox } from "@turf/bbox";
import { MapLoadingButton } from "@macrostrat/map-interface";
import { MapArea } from "../map";
import { BoundsLayer } from "~/client-components";
import { BackButton, LayerControlPanel } from "../controls";
import { expandBounds } from "../map-utils";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    MapStateProvider,
    { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
    h(PageInner, { baseURL, context: ctx }),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const isMapContext = ctx.type === "map";

  const showMapArea = useMapState((state) => state.showMapArea);

  // We might not have any bounds yet, though this should probably be required...
  const bounds = expandBounds(ctx.bounds);

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
        contextPanel: h(LayerControlPanel),
        isMapView: isMapContext,
      },
      [h(BoundsLayer, { bounds: ctx.bounds, visible: showMapArea })],
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
      h("h2", "Display map"),
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
