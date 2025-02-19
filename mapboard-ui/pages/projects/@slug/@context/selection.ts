import hyper from "@macrostrat/hyper";
import styles from "./selection.module.sass";
import { IconName, NonIdealState } from "@blueprintjs/core";
import { PickerList, PickerListItem } from "~/components/list";
import { useMapActions, useMapState } from "./state";

const h = hyper.styled(styles);

/** Swift map edit action
 public enum MapEditAction: Action, Codable, CaseIterable {
 // Delete all features of type...
 case deleteDataType(dataType: DataTypeID, featureOperation: DataTypeFeatureOperation?)
 // Core operations
 case new(data: LineData, settings: LayerSettings)
 case newPoint(data: Point, layer: MapLayerID)
 case erase(eraser: Polygon, predicate: ErasePredicate)
 case delete(features: [Int])
 case changeType(features: [Int], type: DataTypeID)
 case changeLayer(features: [Int], layer: MapLayerID)
 // Advanced operations
 // Topological erase for lines
 case topologicalErase(eraser: Polygon, predicate: ErasePredicate)
 case reshape(data: LineData, settings: LayerSettings)
 case heal(features: [Int], type: DataTypeID)
 case cut(blade: LineData, settings: LayerSettings, width: Float?)
 case select(area: Polygon, types: [DataTypeID]?)
 // Feature adjustments
 case adjustLineWidth(features: [Int], width: Float?, mapWidth: Float?)
 case adjustCertainty(features: [Int], certainty: Int?)
 case reverseLines(features: [Int])
 case recalculateTopology(features: [Int])
 case undo
 }
 **/

type ActionCfg = {
  name: string;
  icon: IconName;
  id: SelectionActionType;
};

export enum SelectionActionType {
  Delete = "delete",
  Heal = "heal",
  ChangeType = "changeType",
  ChangeLayer = "changeLayer",
  AdjustWidth = "adjustWidth",
  AdjustCertainty = "adjustCertainty",
  ReverseLines = "reverseLines",
  RecalculateTopology = "recalculateTopology",
}

const actions: ActionCfg[] = [
  { id: SelectionActionType.Delete, name: "Delete", icon: "trash" },
  { id: SelectionActionType.Heal, name: "Heal", icon: "changes" },
  { id: SelectionActionType.ChangeType, name: "Change type", icon: "edit" },
  { id: SelectionActionType.ChangeLayer, name: "Change layer", icon: "layers" },
  {
    id: SelectionActionType.AdjustWidth,
    name: "Adjust width",
    icon: "horizontal-distribution",
  },
  {
    id: SelectionActionType.AdjustCertainty,
    name: "Adjust certainty",
    icon: "confirm",
  },
  {
    id: SelectionActionType.ReverseLines,
    name: "Reverse lines",
    icon: "swap-horizontal",
  },
  {
    id: SelectionActionType.RecalculateTopology,
    name: "Recalculate topology",
    icon: "polygon-filter",
  },
];

export function SelectionActionsPanel() {
  const action = useMapState((state) => state.selectionAction);
  const selectAction = useMapActions((state) => state.setSelectionAction);

  // test vvv
  return h("div.selection-actions", [
    h(
      PickerList,
      { className: "actions-list" },
      actions.map((d) => {
        return h(
          PickerListItem,
          {
            icon: d.icon,
            active: action == d.id,
            onClick() {
              selectAction(d.id);
            },
          },
          d.name,
        );
      }),
    ),
    h(ActionDetailsPanel, { action }),
  ]);
}

function ActionDetailsPanel({ action }) {
  if (action == null) {
    return h(NonIdealState, {
      title: "No action selected",
      icon: "flows",
    });
  }
  const actionCfg = actions.find((d) => d.id == action);

  if (actionCfg == null) {
    return h(NonIdealState, {
      title: "Unknown action",
      icon: "warning-sign",
    });
  }

  return h("div.action-details", [h("h2", actionCfg.name), h("p", "Details")]);
}
