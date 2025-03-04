import { SelectionMode, useMapActions, useMapState } from "../state";
import { BaseInfoDrawer } from "@macrostrat/map-interface";
import { SelectionActionsPanel } from "./action-controls";
import { FormGroup, OptionProps, SegmentedControl } from "@blueprintjs/core";
import hyper from "@macrostrat/hyper";
import styles from "./control-panel.module.sass";

const h = hyper.styled(styles);

const featureTypes = ["lines", "points", "polygons"];

export function SelectionDrawer() {
  const selection = useMapState((state) => state.selection);
  const selectFeatures = useMapActions((a) => a.selectFeatures);
  if (selection == null) {
    return null;
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
      h("div.selection-counts", [
        featureTypes.map((type) => {
          const count = selection[type]?.length;
          if (count == null || count == 0) {
            return null;
          }
          return h("p", `${count} ${type} selected`);
        }),
      ]),
      h(SelectionModePicker),
      h(SelectionActionsPanel),
    ],
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
