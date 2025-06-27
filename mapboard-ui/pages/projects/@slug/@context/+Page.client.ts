import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import { mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import {
  AnchorButton,
  Divider,
  FormGroup,
  NumericInput,
  Spinner,
  Switch,
} from "@blueprintjs/core";
import {
  BasemapType,
  FeatureMode,
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
import { ReactNode } from "react";

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
      { baseURL, baseLayers: ctx.layers },
      h(PageInner, { baseURL, context: ctx }),
    ),
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
      h(LayerControlPanel),
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
  const selectedLayer = useMapState((state) => state.activeLayer);

  let opts: ReactNode;

  if (selectedLayer == null) {
    opts = h(MultiLayerViewOptions);
  } else {
    opts = h(SingleLayerViewOptions);
  }

  return h("div.layer-control-panel.bp5-form", [
    h(OverlayHeader),
    h(LayerList),
    opts,
    h(Divider),
    h(BasemapList),
    h(TerrainExaggeration),
    h(TopologyPrimitivesSwitch),
  ]);
}

function TopologyPrimitivesSwitch() {
  const showPrimitives = useMapState((state) => state.showTopologyPrimitives);
  const togglePrimitives = useMapActions(
    (actions) => actions.toggleShowTopologyPrimitives,
  );

  return h(OurSwitch, {
    label: "Topology primitives",
    checked: showPrimitives,
    onChange: togglePrimitives,
  });
}

function TerrainExaggeration() {
  const onValueChange = useMapActions(
    (actions) => actions.setTerrainExaggeration,
  );
  const value = useMapState((state) => state.terrainExaggeration);

  return h(
    FormGroup,
    {
      label: "Terrain exaggeration",
      inline: true,
      fill: true,
    },
    [
      h(NumericInput, {
        value,
        onValueChange,
        min: 1,
        max: 3,
        stepSize: 0.5,
        className: "terrain-exaggeration",
        size: "small",
      }),
    ],
  );
}

function OverlayHeader() {
  const showOverlay = useMapState((state) => state.showOverlay);
  const toggleOverlay = useMapActions((actions) => actions.toggleOverlay);

  return h("div.overlay-header", [
    h("h4", "Overlay"),
    h(OurSwitch, {
      label: "Show",
      checked: showOverlay,
      onChange: toggleOverlay,
    }),
  ]);
}

function MultiLayerViewOptions() {
  /** View options for the case where no layers are selected */

  const checked = useMapState((state) => state.showCrossSectionLines);
  const onChange = useMapActions((actions) => actions.toggleCrossSectionLines);

  return h(OurSwitch, {
    label: "Cross section lines",
    checked,
    onChange,
  });
}

function SingleLayerViewOptions() {
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);
  const toggleFeatureMode = useMapActions(
    (actions) => actions.toggleFeatureMode,
  );
  const showFacesWithNoUnit = useMapState((state) => state.showFacesWithNoUnit);
  const toggleFacesWithNoUnit = useMapActions(
    (actions) => actions.toggleShowFacesWithNoUnit,
  );

  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);

  const toggleLineEndpoints = useMapActions(
    (actions) => actions.toggleLineEndpoints,
  );

  const switchProps = (mode: FeatureMode) => {
    return {
      checked: enabledFeatureModes.has(mode),
      onChange() {
        toggleFeatureMode(mode);
      },
    };
  };

  return h("div.view-options", [
    h(OurSwitch, {
      label: "Lines",
      ...switchProps(FeatureMode.Line),
    }),
    h("div.subsidiary-switches", [
      h(OurSwitch, {
        label: "Endpoints",
        checked: showLineEndpoints,
        onChange() {
          toggleLineEndpoints();
        },
      }),
    ]),
    h(OurSwitch, {
      label: "Polygons",
      ...switchProps(FeatureMode.Polygon),
    }),
    h(OurSwitch, {
      label: "Fills",
      ...switchProps(FeatureMode.Fill),
    }),
    h("div.subsidiary-switches", [
      h(OurSwitch, {
        label: "Faces without units",
        checked: showFacesWithNoUnit,
        onChange: toggleFacesWithNoUnit,
      }),
    ]),
  ]);
}

function OurSwitch(props) {
  return h(Switch, { alignIndicator: "right", ...props });
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
      icon: "map",
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
        setActive(layer?.id);
      },
      label: "layer",
      icon: "layers",
      fill: false,
      nullable: true,
    }),
  );
}
