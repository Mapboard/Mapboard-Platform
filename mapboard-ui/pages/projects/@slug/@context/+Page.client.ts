import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import { mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider, useMapState } from "./state";
import { bbox } from "@turf/bbox";
import { MapLoadingButton } from "@macrostrat/map-interface";
import { MapArea } from "./map";
import { ToasterContext } from "@macrostrat/ui-components";
import { BoundsLayer } from "~/client-components";
import { BackButton, LayerControlPanel } from "./controls";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    ToasterContext,
    h(
      MapStateProvider,
      { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
      h(PageInner, { baseURL, context: ctx }),
    ),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const isMapContext = ctx.type === "map";

  const showMapArea = useMapState((state) => state.showMapArea);

  let bounds = null;
  // We might not have any bounds yet, though this should probably be required...
  if (ctx.bounds) {
    // Expand the bounds slightly for better view
    const b0 = bbox(ctx.bounds);
    const expansionFactor = 0.1; // 10% expansion
    const width = b0[2] - b0[0];
    const height = b0[3] - b0[1];
    const expandedBounds: any = [
      b0[0] - width * expansionFactor,
      b0[1] - height * expansionFactor,
      b0[2] + width * expansionFactor,
      b0[3] + height * expansionFactor,
    ];

    bounds = expandedBounds;
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
