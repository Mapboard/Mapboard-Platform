import hyper from "@macrostrat/hyper";
import styles from "./selection.module.sass";
import { Button, IconName, Intent, NonIdealState } from "@blueprintjs/core";
import { PickerList, PickerListItem } from "~/components/list";
import { useMapActions, useMapState } from "./state";
import { Select, Select2 } from "@blueprintjs/select";

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
  description?: string;
  intent?: Intent;
  detailsForm?: React.ComponentType;
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
  {
    id: SelectionActionType.Delete,
    name: "Delete",
    icon: "trash",
    description: "Delete selected features",
    intent: "danger",
  },
  {
    id: SelectionActionType.Heal,
    name: "Heal",
    icon: "changes",
    description: "Heal selected features",
  },
  {
    id: SelectionActionType.RecalculateTopology,
    name: "Recalculate topology",
    icon: "polygon-filter",
    description: "Recalculate the topology of selected features",
  },
  { id: SelectionActionType.ChangeType, name: "Change type", icon: "edit" },
  {
    id: SelectionActionType.ChangeLayer,
    name: "Change layer",
    icon: "layers",
    detailsForm: ChangeLayerForm,
  },
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
  const actionCfg = actions.find((d) => d.id == action);
  const title = actionCfg?.name ?? "No action selected";

  return h("div.action-details", [
    h("h2", title),
    h(ActionDetailsContent, { action: actionCfg }),
  ]);
}

function ActionDetailsContent({
  action,
}: {
  action: ActionCfg | undefined | null;
}) {
  if (action == null) {
    return h(NonIdealState, {
      icon: "flows",
    });
  }

  const { description, intent = "primary", detailsForm } = action;

  return h("div.action-details-content", [
    h.if(description != null)("p", description),
    h.if(detailsForm != null)(detailsForm),
    h("div.spacer"),
    h(Button, { intent, icon: "play" }, "Run"),
  ]);
}

function ChangeLayerForm() {
  const layers = useMapState((state) => state.mapLayers);
  const currentLayer = useMapState((state) => state.activeLayer);
  const possibleLayers = layers.filter((d) => d.id != currentLayer);

  return h(
    Select,
    {
      items: possibleLayers,
      itemRenderer: (layer, { handleClick }) => {
        return h("div", { onClick: handleClick }, layer.name);
      },
      onItemSelect: (layer) => {
        console.log("Selected layer", layer);
      },
      popoverProps: { minimal: true },
      fill: true,
    },
    h(Button, { className: "select-placeholder", text: "Change layer" }),
  );
}
