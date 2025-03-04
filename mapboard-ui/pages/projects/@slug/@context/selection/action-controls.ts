import hyper from "@macrostrat/hyper";
import styles from "./action-controls.module.css";
import { FormGroup, MenuItem, NumericInput } from "@blueprintjs/core";
import { MapLayer, MapState, useMapState, useMapStateAPI } from "../state";
import {
  ActionDef,
  ActionsPreflightPanel,
  ItemSelect,
} from "@macrostrat/form-components";
import { Box, NullableSlider, useToaster } from "@macrostrat/ui-components";
import { useEffect } from "react";

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
  | ActionDef<SelectionActionType.Heal, string>
  | ActionDef<SelectionActionType.RecalculateTopology>
  | ActionDef<SelectionActionType.ChangeType, string>
  | ActionDef<SelectionActionType.ChangeLayer, number>
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
    detailsForm: HealForm,
    isReady(state) {
      return state != null;
    },
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
      return state != null;
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
  const store = useMapStateAPI();
  const Toaster = useToaster();
  return h(ActionsPreflightPanel, {
    onRunAction(action: MapboardActionDef, state: any) {
      const mapState = store.getState();
      console.log("Running action", action, state, mapState);
      runAction(action, state, mapState).then((resp) => {
        const defaultMessage = resp.error ? "Error" : "Success";
        Toaster?.show({
          message: resp.message ?? resp.reason ?? defaultMessage,
          intent: resp.error ? "danger" : "success",
        });
        // If successful, notify that the layer has changed
        if (!resp.error) {
          mapState.actions.notifyChange("line");
        }
      });
    },
    actions,
  });
}

function synthesizeAction(
  action: MapboardActionDef,
  state: any,
  mapState: MapState,
) {
  let actionData = {
    features: mapState.selection?.lines,
  };

  if (
    action.id == SelectionActionType.Heal ||
    action.id == SelectionActionType.ChangeType
  ) {
    actionData.type = state;
  } else if (action.id == SelectionActionType.ChangeLayer) {
    actionData.layer = state;
  }

  const baseAction = {
    [action.id]: actionData,
  };

  return {
    action: baseAction,
    layer: mapState.activeLayer,
    mode: "line",
  };
}

async function runAction(
  action: MapboardActionDef,
  state: any,
  mapState: MapState,
) {
  const url = `${mapState.apiBaseURL}/changes`;
  const lines = mapState.selection?.lines;
  if (lines == null) {
    throw new Error("No lines selected");
  }
  const actionBody = synthesizeAction(action, state, mapState);
  console.log(actionBody);
  const body = JSON.stringify(actionBody);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  return response.json();
}

type DataType = any;

function HealForm({
  state,
  setState,
}: {
  state: string | null;
  setState(k: string | null): void;
}) {
  const selectedLineTypes = useMapState((state) => state.selection?.lineTypes);
  let defaultSelectedID: string | null = null;
  if (selectedLineTypes != null && selectedLineTypes.size == 1) {
    defaultSelectedID = selectedLineTypes.values().next().value ?? null;
  }

  useEffect(() => {
    if (defaultSelectedID != null && state == null) {
      setState(defaultSelectedID);
    }
  }, [defaultSelectedID]);

  return h(ChangeDataTypeForm, { state, setState });
}

function ChangeDataTypeForm({
  state,
  setState,
  defaultSelectedID = null,
}: {
  state: string | null;
  setState(state: string | null): void;
  defaultSelectedID?: string | null;
}) {
  const dataTypes = useMapState((state) => state.dataTypes?.line);

  const selectedID = state ?? defaultSelectedID;

  const selectedItem = dataTypes?.find((d) => d.id == selectedID) ?? null;

  return h(ItemSelect<DataType>, {
    items: dataTypes,
    selectedItem,
    onSelectItem(item) {
      setState(item.id);
    },
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
  state: number | null;
  setState(state: number): void;
}) {
  const layers = useMapState((state) => state.mapLayers);
  const currentLayerID = useMapState((state) => state.activeLayer);

  const selectedLayerID = state;

  const possibleLayers = layers?.filter((d) => d.id != currentLayerID) ?? null;
  const selectedLayerItem =
    layers?.find((d) => d.id == selectedLayerID) ?? null;

  return h(ItemSelect<MapLayer>, {
    items: possibleLayers,
    selectedItem: selectedLayerItem,
    onSelectItem: (layer) => {
      setState(layer?.id);
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
