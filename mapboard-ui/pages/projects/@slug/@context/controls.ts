import hyper from "@macrostrat/hyper";
import styles from "./map.module.scss";
import {
  AnchorButton,
  Button,
  Divider,
  FormGroup,
  NonIdealState,
  NumericInput,
  SegmentedControl,
  Slider,
  Spinner,
  Switch,
} from "@blueprintjs/core";
import { BasemapType, useMapActions, useMapState } from "./state";
import { ItemSelect } from "@macrostrat/form-components";
import { FeatureMode, MapLayer } from "./types";
import { useAtom, useSetAtom } from "jotai";
import { overlayClipAtom, overlayOpacityAtom, showStationsAtom } from "./style";
import { incrementRevisionAtom, mapReloadCounterAtom } from "./change-watcher";
import { useMapStatus } from "@macrostrat/mapbox-react";

const h = hyper.styled(styles);

export function LayerControlPanel() {
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
    h(OpacitySlider),
    h(LayerList),
    h(SingleLayerViewOptions),
    h(ShowStationsSwitch),
    h(Divider),
    h(BasemapList),
    h(TerrainExaggeration),
    h(TopologyPrimitivesSwitch),
    h(ClipToBoundsSwitch),
    h(StyleModeControl),
    h(RefreshMapSwitch),
  ]);
}

function RefreshMapSwitch() {
  const reloadTimestamp = useSetAtom(incrementRevisionAtom);
  const isLoading = useMapStatus((s) => s.isLoading);

  return h(
    Button,
    {
      onClick: reloadTimestamp,
      disabled: isLoading,
    },
    "Refresh map",
  );
}

function ShowStationsSwitch() {
  const [showStations, setShowStations] = useAtom(showStationsAtom);

  return h(Switch, {
    label: "Stations",
    checked: showStations,
    onChange() {
      setShowStations((s) => !s);
    },
  });
}

export function BackButton({ href, children, className }) {
  return h(
    AnchorButton,
    { minimal: true, href, icon: "arrow-left", small: true, className },
    children,
  );
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

function ClipToBoundsSwitch() {
  const [clip, setClip] = useAtom(overlayClipAtom);
  return h(OurSwitch, {
    label: "Clip to context bounds",
    checked: clip,
    onChange() {
      setClip((c) => !c);
    },
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

function OpacitySlider() {
  const [value, setValue] = useAtom(overlayOpacityAtom);
  const enabled = useMapState((state) => state.showOverlay);

  return h(FormGroup, { label: "Opacity", inline: true, fill: true }, [
    h(Slider, {
      min: 0,
      max: 1,
      stepSize: 0.1,
      value,
      onChange: setValue,
      disabled: !enabled,
    }),
  ]);
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
