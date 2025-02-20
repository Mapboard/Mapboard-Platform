import hyper from "@macrostrat/hyper";
import styles from "./selection.module.css";
import {
  Button,
  IconName,
  Intent,
  Menu,
  MenuItem,
  NonIdealState,
  Spinner,
} from "@blueprintjs/core";
import { PickerList, PickerListItem } from "~/components/list";
import {
  MapLayer,
  SelectionActionState,
  useMapActions,
  useMapState,
} from "./state";
import { Select } from "@blueprintjs/select";
import { MouseEventHandler } from "react";

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
  detailsForm?: React.ComponentType<{ state: any; updateState: any }>;
  disabled?: boolean;
  ready?: (state: any) => boolean;
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
    disabled: true,
  },
  {
    id: SelectionActionType.AdjustCertainty,
    name: "Adjust certainty",
    icon: "confirm",
    disabled: true,
  },
  {
    id: SelectionActionType.ReverseLines,
    name: "Reverse lines",
    icon: "swap-horizontal",
    disabled: true,
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
            active: action?.type == d.id,
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

function ActionDetailsPanel({
  action,
}: {
  action: SelectionActionState<any> | null;
}) {
  let title = "No action selected";
  const actionCfg = actions.find((d) => d.id == action?.type);
  if (action != null) {
    title = actionCfg?.name ?? "Unknown action";
  }

  let content: any = h(NonIdealState, {
    icon: "flows",
  });
  title = actionCfg?.name ?? "No action selected";

  if (action != null && actionCfg != null) {
    content = h(ActionDetailsContent, {
      action: actionCfg,
      state: action?.state,
    });
  }

  return h("div.action-details", [h("h2", title), content]);
}

function ActionDetailsContent({
  action,
  state,
}: {
  action: ActionCfg;
  state: any | null;
}) {
  const { description, intent = "primary", detailsForm } = action;

  const updateState = useMapActions((state) => state.setSelectionActionState);

  let disabled = false;
  if (action.ready != null) {
    disabled = !action.ready(state);
  }

  return h("div.action-details-content", [
    h.if(description != null)("p", description),
    h.if(detailsForm != null)(detailsForm, { state, updateState }),
    h("div.spacer"),
    h(Button, { intent, icon: "play", disabled }, "Run"),
  ]);
}

interface ChangeLayerState {
  selectedLayerID: number;
}

function ChangeLayerForm({
  state,
  updateState,
}: {
  state: ChangeLayerState | null;
  updateState(state: ChangeLayerState): void;
}) {
  const layers = useMapState((state) => state.mapLayers);
  const currentLayer = useMapState((state) => state.activeLayer);

  if (layers == null) {
    return h(Spinner);
  }

  const possibleLayers = layers.filter((d) => d.id != currentLayer);
  const selectedLayerID = state?.selectedLayerID ?? currentLayer;

  const currentLayerItem = layers.find((d) => d.id == selectedLayerID);

  return h(
    Select<MapLayer>,
    {
      items: possibleLayers,
      itemRenderer: (layer, { handleClick }) => {
        return h(LayerItem, { layer, onClick: handleClick });
      },
      onItemSelect: (layer) => {
        updateState({ selectedLayerID: layer.id });
      },
      popoverProps: { minimal: true },
      fill: true,
    },
    h(
      Menu,
      h(LayerItem, {
        className: "select-placeholder",
        layer: currentLayerItem,
        disabled: selectedLayerID == currentLayer,
      }),
    ),
  );
}

function LayerItem({
  selected,
  layer,
  className,
  onClick,
  disabled,
}: {
  selected?: boolean;
  layer: any;
  className?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
}) {
  return h(MenuItem, {
    icon: "layers",
    text: layer?.name ?? "No layer selected",
    active: selected,
    className,
    onClick,
    disabled,
  });
}
