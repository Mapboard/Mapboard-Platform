import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import { mapboxToken } from "~/settings";
import type { Data } from "../+data";
import { useData } from "vike-react/useData";
import {
  AnchorButton,
  Divider,
  FormGroup,
  NonIdealState,
  NumericInput,
  SegmentedControl,
  Spinner,
  Switch,
} from "@blueprintjs/core";
import {
  BasemapType,
  MapStateProvider,
  useMapActions,
  useMapState,
} from "./state";
import { bbox } from "@turf/bbox";
import { MapLoadingButton } from "@macrostrat/map-interface";
import { MapArea } from "./map";
import { ToasterContext } from "@macrostrat/ui-components";
import { ItemSelect } from "@macrostrat/form-components";
import { FeatureMode, MapLayer } from "./types";
import { Provider } from "jotai";
import { BoundsLayer } from "~/client-components";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    ToasterContext,
    h(
      Provider,
      h(
        MapStateProvider,
        { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
        h(PageInner, { baseURL, context: ctx }),
      ),
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

function BackButton({ href, children, className }) {
  return h(
    AnchorButton,
    { minimal: true, href, icon: "arrow-left", small: true, className },
    children,
  );
}

function LayerControlPanel() {
  const selectedLayer = useMapState((state) => state.activeLayer);

  if (selectedLayer == null) {
    return h(NonIdealState, {
      icon: "layers",
      title: "No layer selected",
      description: "Select a layer to view its options.",
    });
  }

  return h("div.layer-control-panel.bp5-form", [
    h(OverlayHeader),
    h(LayerList),
    h(SingleLayerViewOptions),
    h(Divider),
    h(BasemapList),
    h(TerrainExaggeration),
    h(TopologyPrimitivesSwitch),
    h(StyleModeControl),
  ]);
}

function StyleModeControl() {
  const styleMode = useMapState((state) => state.styleMode);
  const setStyleMode = useMapActions((actions) => actions.setStyleMode);

  return h(
    FormGroup,
    { label: "Style mode", inline: true, fill: true },
    h(SegmentedControl, {
      options: [
        { label: "Display", value: "display" },
        { label: "Edit", value: "edit" },
      ],
      onValueChange(value) {
        setStyleMode(value as "edit" | "display");
      },
      value: styleMode,
    }),
  );
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
  const showMapArea = useMapState((state) => state.showMapArea);

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

  const checked = useMapState((state) => state.showCrossSectionLines);
  const onChange = useMapState((state) => state.toggleCrossSectionLines);

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
      label: "Cross section lines",
      checked,
      onChange,
    }),
    h(OurSwitch, {
      label: "Map area",
      checked: showMapArea,
      onChange: useMapActions((actions) => actions.toggleMapArea),
    }),
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
