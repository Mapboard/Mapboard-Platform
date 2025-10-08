import { useMapActions, useMapState } from "../state";
import { BaseInfoDrawer, InfoDrawerContainer } from "@macrostrat/map-interface";
import { SelectionActionsPanel } from "./action-controls";
import {
  FormGroup,
  OptionProps,
  SegmentedControl,
  Spinner,
} from "@blueprintjs/core";
import hyper from "@macrostrat/hyper";
import styles from "./control-panel.module.sass";
import { layerNameForFeatureMode } from "./manager";
import { useEffect } from "react";
import { JSONView, useAPIResult } from "@macrostrat/ui-components";
import { FeatureMode, SelectionMode } from "../types";
import { GeoJSONFeature, LngLat, LngLatLike } from "mapbox-gl";

const h = hyper.styled(styles);

const featureTypes = ["lines", "points", "polygons"];

function InspectPositionDrawer({
  data,
  onClose,
}: {
  data: {
    position: LngLatLike;
    tileFeatureData: GeoJSONFeature[];
  };
  onClose: () => void;
}) {
  const baseURL = useMapState((state) => state.apiBaseURL);
  const mapLayer = useMapState((state) => state.activeLayer);

  const { position, tileFeatureData } = data;

  const lngLat = LngLat.convert(position);

  const res = useAPIResult(
    `${baseURL}/info/${lngLat.lng},${lngLat.lat}?radius=20`,
  );

  let baseData = h(Spinner);
  if (res != null) {
    baseData = h(JSONView, {
      data: filterFeaturesForActiveMapLayer(res, mapLayer),
      showRoot: false,
      expanded: true,
    });
  }

  let tileFeatureView = null;
  if (tileFeatureData.length > 0) {
    tileFeatureView = h([
      h("h3", "Tile features"),
      h(JSONView, {
        showRoot: false,
        expanded: true,
        data: tileFeatureData.map(filterTileFeatureData),
      }),
    ]);
  }

  return h(
    BaseInfoDrawer,
    {
      position,
      onClose,
    },
    [baseData, tileFeatureView],
  );
}

interface FeatureInfo {
  map_layer: number;
  [key: string]: any;
}

interface FeatureData {
  fills: FeatureInfo[] | undefined | null;
  lines: FeatureInfo[] | undefined | null;
  topology: {
    edges: any[];
    faces: any[];
  };
}

function filterFeaturesForActiveMapLayer(
  features: FeatureData,
  activeLayer?: number,
) {
  if (activeLayer == null) {
    return features;
  }

  return {
    ...features,
    fills: features.fills?.filter((d) => d.map_layer === activeLayer),
    lines: features.lines?.filter((d) => d.map_layer === activeLayer),
  };
}

function filterTileFeatureData(feature: GeoJSONFeature) {
  return {
    source: feature.source,
    sourceLayer: feature.sourceLayer,
    id: feature.id,
    ...feature.properties,
  };
}

export function SelectionDrawer() {
  const selection = useMapState((state) => state.selection);
  const selectFeatures = useMapActions((a) => a.selectFeatures);

  const inspect = useMapState((state) => state.inspect);

  if (selection == null && inspect == null) {
    return null;
  }

  if (inspect != null) {
    return h(InspectPositionDrawer, {
      data: inspect,
      onClose() {
        selectFeatures(null);
      },
    });
  }

  const { type, features } = selection;
  const count = features.length;
  let typeName = layerNameForFeatureMode(type);
  if (count == 1) {
    typeName = typeName.replace(/s$/, "");
  }

  return h(
    BaseInfoDrawer,
    {
      title: "Selection",
      onClose() {
        selectFeatures(null);
      },
    },
    [
      h(SelectionFeatureModePicker),
      h("div.selection-counts", [
        h.if(count > 0)("p", `${count} ${typeName} selected`),
      ]),
      h(SelectionModePicker),
      h(SelectionActionsPanel, { featureMode: type }),
    ],
  );
}

const featureModes: OptionProps<string>[] = [
  { value: FeatureMode.Line, label: "Lines" },
  { value: FeatureMode.Polygon, label: "Polygons" },
  { value: FeatureMode.Fill, label: "Fills" },
];

function SelectionFeatureModePicker() {
  const setFeatureMode = useMapActions((a) => a.setSelectionFeatureMode);
  const activeMode = useMapState((state) => state.selectionFeatureMode);

  return h(
    FormGroup,
    {
      className: "selection-mode-control",
      inline: true,
      label: "Feature mode",
    },
    h(SegmentedControl, {
      options: featureModes,
      value: activeMode,
      onValueChange: setFeatureMode,
      small: true,
    }),
  );
}

const modes: OptionProps<string>[] = [
  { value: SelectionMode.Add, label: "Add" },
  { value: SelectionMode.Subtract, label: "Subtract" },
  { value: SelectionMode.Replace, label: "Replace" },
];

function SelectionModePicker() {
  /** Picker to define how we are selecting features */
  const setSelectionMode = useMapActions((a) => a.setSelectionMode);
  const activeMode = useMapState((state) => state.selectionMode);
  return h(
    FormGroup,
    {
      className: "selection-mode-control",
      inline: true,
      label: "Selection mode",
    },
    h(SegmentedControl, {
      options: modes,
      value: activeMode,
      onValueChange: setSelectionMode,
      small: true,
    }),
  );
}
