import {
  FeatureMode,
  SelectionMode,
  useMapActions,
  useMapState,
} from "../state";
import { BaseInfoDrawer } from "@macrostrat/map-interface";
import { SelectionActionsPanel } from "./action-controls";
import { FormGroup, OptionProps, SegmentedControl } from "@blueprintjs/core";
import hyper from "@macrostrat/hyper";
import styles from "./control-panel.module.sass";
import { layerNameForFeatureMode } from "./manager";

const h = hyper.styled(styles);

const featureTypes = ["lines", "points", "polygons"];

export function SelectionDrawer() {
  const selection = useMapState((state) => state.selection);
  const selectFeatures = useMapActions((a) => a.selectFeatures);
  if (selection == null) {
    return null;
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
  { value: FeatureMode.Topology, label: "Faces" },
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
