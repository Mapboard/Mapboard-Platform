import hyper from "@macrostrat/hyper";
import styles from "./selection.module.css";
import { FormGroup, MenuItem, NumericInput } from "@blueprintjs/core";
import { MapLayer } from "./state";
import {
  ActionDef,
  ActionsPreflightPanel,
  ItemSelect,
} from "@macrostrat/form-components";
import { Box, NullableSlider } from "@macrostrat/ui-components";

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

type MapboardActionDef =
  | ActionDef<SelectionActionType.Delete>
  | ActionDef<SelectionActionType.Heal>
  | ActionDef<SelectionActionType.RecalculateTopology>
  | ActionDef<SelectionActionType.ChangeType, string>
  | ActionDef<SelectionActionType.ChangeLayer, ChangeLayerState>
  | ActionDef<SelectionActionType.AdjustWidth, number>
  | ActionDef<SelectionActionType.AdjustCertainty, number | null>
  | ActionDef<SelectionActionType.ReverseLines>;

const actions: MapboardActionDef[] = [
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
  {
    id: SelectionActionType.ChangeType,
    name: "Change type",
    icon: "edit",
    detailsForm: ChangeDataTypeForm,
    isReady(state) {
      return state != null;
    },
  },
  {
    id: SelectionActionType.ChangeLayer,
    name: "Change layer",
    icon: "layers",
    detailsForm: ChangeLayerForm,
    isReady(state) {
      return state?.selectedLayerID != null;
    },
  },
  {
    id: SelectionActionType.AdjustWidth,
    name: "Adjust width",
    icon: "horizontal-distribution",
    disabled: true,
    detailsForm: AdjustWidthForm,
    defaultState: 5,
    isReady(state) {
      return state != null;
    },
  },
  {
    id: SelectionActionType.AdjustCertainty,
    name: "Adjust certainty",
    icon: "confirm",
    disabled: true,
    detailsForm: AdjustCertaintyForm,
  },
  {
    id: SelectionActionType.ReverseLines,
    name: "Reverse lines",
    icon: "swap-horizontal",
    disabled: true,
  },
];

export function SelectionActionsPanel() {
  return h(ActionsPreflightPanel, {
    onRunAction(action: MapboardActionDef, state: any) {
      console.log("Running action", action, state);
    },
    actions,
  });
}

interface ChangeLayerState {
  selectedLayerID: number;
}

type DataType = any;

function ChangeDataTypeForm({ state, setState }) {
  return h(ItemSelect<DataType>, {
    items: [],
    selectedItem: state,
    onSelectItem: setState,
    label: "data type",
    icon: "tag",
    itemComponent: ({ item, ...rest }) => {
      return h(MenuItem, {
        icon: h(Box, {
          is: "span",
          width: "1em",
          height: "1em",
          backgroundColor: item.color,
          borderRadius: "3px",
        }),
        text: item.name,
        ...rest,
      });
    },
  });
}

function ChangeLayerForm({
  state,
  setState,
}: {
  state: ChangeLayerState | null;
  setState(state: ChangeLayerState): void;
}) {
  const layers: MapLayer[] = [];
  const currentLayer = null;

  const selectedLayerID = state?.selectedLayerID ?? currentLayer;
  const possibleLayers = layers.filter((d) => d.id != selectedLayerID);
  const currentLayerItem = layers.find((d) => d.id == selectedLayerID) ?? null;

  return h(ItemSelect<MapLayer>, {
    items: possibleLayers,
    selectedItem: currentLayerItem,
    onSelectItem: (layer) => {
      setState({ selectedLayerID: layer.id });
    },
    label: "layer",
    icon: "layers",
  });
}

function AdjustWidthForm({ state, setState }) {
  return h(
    FormGroup,
    { label: "Width", labelInfo: "pixels" },
    h(NumericInput, {
      min: 0,
      max: 10,
      value: state,
      majorStepSize: 1,
      minorStepSize: 0.2,
      onValueChange(value) {
        setState(Math.max(Math.min(value, 10), 0));
      },
    }),
  );
}

function AdjustCertaintyForm({ state, setState }) {
  return h(
    FormGroup,
    { label: "Certainty" },
    h(NullableSlider, {
      min: 0,
      max: 10,
      value: state,
      onChange(value) {
        setState(value);
      },
    }),
  );
}
