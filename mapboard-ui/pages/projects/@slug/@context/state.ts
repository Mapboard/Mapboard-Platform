import { createStore, useStore, StoreApi, create } from "zustand";
import { createContext, useContext, useEffect, useState } from "react";
import h from "@macrostrat/hyper";
import { subscribeWithSelector } from "zustand/middleware";
import { SelectionActionType } from "./selection";
import { SourceChangeTimestamps } from "./style";

interface RecoverableMapState {
  activeLayer: number | null;
  baseMap: BasemapType;
}

interface MapActions {
  setActiveLayer: (layer: number) => void;
  setBaseMap: (baseMap: BasemapType) => void;
  selectFeatures: (selection: FeatureSelection | null) => void;
  toggleLayerPanel: () => void;
  setMapLayers: (layers: any[]) => void;
  setSelectionAction: (action: SelectionActionType | null) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSelectionActionState: (state: any) => void;
  setDataTypes: (mode: "line" | "polygon", types: DataType[]) => void;
  notifyChange: (mode: "line" | "polygon" | "topo") => void;
  toggleLineEndpoints: () => void;
  toggleFeatureMode: (mode: FeatureMode) => void;
}

export interface SelectionActionState<T extends object> {
  type: SelectionActionType;
  state: T | null;
}

export interface MapLayer {
  id: number;
  name: string;
}

export interface DataType {
  id: string;
  name: string;
  color: string;
}

export enum SelectionMode {
  Add = "add",
  Subtract = "subtract",
  Replace = "replace",
}

export enum FeatureMode {
  Line = "line",
  Polygon = "polygon",
  Topology = "topology",
}

export const allFeatureModes = new Set([
  FeatureMode.Line,
  FeatureMode.Polygon,
  FeatureMode.Topology,
]);

interface PolygonDataType extends DataType {
  symbology?: {
    name: string;
    color?: string;
  };
}

export interface MapState extends RecoverableMapState {
  actions: MapActions;
  layerPanelIsOpen: boolean;
  selection: FeatureSelection | null;
  selectionAction: SelectionActionState<any> | null;
  selectionMode: SelectionMode;
  enabledFeatureModes: Set<FeatureMode>;
  showLineEndpoints: boolean;
  mapLayers: MapLayer[] | null;
  mapLayerIDMap: Map<number, MapLayer>;
  apiBaseURL: string;
  // Time that we last updated the map elements
  lastChangeTime: SourceChangeTimestamps;
  dataTypes: {
    line: DataType[] | null;
    polygon: PolygonDataType[] | null;
  };
}

const MapStateContext = createContext<StoreApi<MapState> | null>(null);

export enum BasemapType {
  Satellite = "satellite",
  Basic = "basic",
  Terrain = "terrain",
}

export type FeatureSelection = {
  lines: number[];
  polygons: number[];
};

const _subscribeWithSelector = subscribeWithSelector as <T>(fn: T) => T;

function createMapStore(baseURL: string) {
  return create<MapState>(
    _subscribeWithSelector((set, get): MapState => {
      const { activeLayer, baseMap } = parseQueryParameters();
      return {
        apiBaseURL: baseURL,
        activeLayer,
        baseMap,
        layerPanelIsOpen: false,
        selection: null,
        selectionAction: null,
        selectionMode: SelectionMode.Replace,
        mapLayers: null,
        enabledFeatureModes: allFeatureModes,
        showLineEndpoints: false,
        lastChangeTime: {
          line: null,
          polygon: null,
          topology: null,
        },
        dataTypes: {
          line: null,
          polygon: null,
        },
        mapLayerIDMap: new Map(),
        actions: {
          setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
          setActiveLayer: (layer) =>
            set((state) => {
              // Toggle the active layer if it's already active
              let activeLayer: number | null = layer;
              if (state.activeLayer === layer) {
                activeLayer = null;
              }
              return { activeLayer, selection: null };
            }),
          notifyChange: (mode: "line" | "polygon" | "topo") => {
            return set((state) => {
              return {
                lastChangeTime: {
                  ...state.lastChangeTime,
                  [mode]: Date.now(),
                },
              };
            });
          },
          setSelectionMode: (mode: SelectionMode) =>
            set({ selectionMode: mode }),
          selectFeatures: (selection) =>
            set((state) => {
              return {
                selection: combineFeatureSelection(
                  state.selection,
                  selection,
                  state.selectionMode,
                ),
              };
            }),
          toggleLayerPanel: () =>
            set((state) => {
              return { layerPanelIsOpen: !state.layerPanelIsOpen };
            }),
          setMapLayers: (layers) =>
            set({
              mapLayers: layers,
              mapLayerIDMap: new Map(layers.map((l) => [l.id, l])),
            }),
          setDataTypes: (mode: "line" | "polygon", types: DataType[]) =>
            set((state) => {
              return {
                dataTypes: {
                  ...state.dataTypes,
                  [mode]: types,
                },
              };
            }),
          setSelectionAction: (type) =>
            set((state) => {
              if (type == null || state.selectionAction?.type == type) {
                return { selectionAction: null };
              }
              return { selectionAction: { type, state: null } };
            }),
          setSelectionActionState: (state: any) => {
            return set((s) => {
              const { selectionAction } = s;
              if (selectionAction == null) {
                return s;
              }
              return {
                selectionAction: { ...selectionAction, state },
              };
            });
          },
          toggleLineEndpoints: () =>
            set((state) => {
              return { showLineEndpoints: !state.showLineEndpoints };
            }),
          toggleFeatureMode: (mode) =>
            set((state) => {
              const enabledFeatureModes = new Set(state.enabledFeatureModes);
              if (enabledFeatureModes.has(mode)) {
                enabledFeatureModes.delete(mode);
              } else {
                enabledFeatureModes.add(mode);
              }
              return { enabledFeatureModes };
            }),
        },
      };
    }),
  );
}

function combineFeatureSelection(
  selection: FeatureSelection | null,
  newSelection: FeatureSelection | null,
  mode: SelectionMode,
): FeatureSelection | null {
  if (selection == null) {
    return newSelection;
  }
  if (newSelection == null) {
    return null;
  }

  switch (mode) {
    case SelectionMode.Add:
      return {
        lines: [...selection.lines, ...newSelection.lines],
        polygons: [...selection.polygons, ...newSelection.polygons],
      };
    case SelectionMode.Subtract:
      return {
        lines: selection.lines.filter((l) => !newSelection.lines.includes(l)),
        polygons: selection.polygons.filter(
          (l) => !newSelection.polygons.includes(l),
        ),
      };
    case SelectionMode.Replace:
      return newSelection;
  }
}

export function MapStateProvider({ children, baseURL }) {
  const [value] = useState(() => createMapStore(baseURL));

  useEffect(() => {
    const unsubscribe = value.subscribe(
      (state) => [state.activeLayer, state.baseMap],
      ([activeLayer, baseMap]) => {
        setQueryParameters({ activeLayer, baseMap });
      },
    );
    return unsubscribe;
  }, []);

  const allModes = ["line", "polygon"] as ("line" | "polygon")[];

  /** Setup basic data types */
  const setMapLayers = value((state) => state.actions.setMapLayers);
  const setDataTypes = value((state) => state.actions.setDataTypes);
  useEffect(() => {
    /** Fetch map layers and data types that are relevant for the map */
    fetchMapLayers(baseURL).then(setMapLayers);
    for (const mode of allModes) {
      const updateTypes = (t: DataType[]) => setDataTypes(mode, t);
      fetchDataTypes(baseURL, mode).then(updateTypes);
    }
  }, []);

  return h(MapStateContext.Provider, { value }, [children]);
}

async function fetchMapLayers(baseURL: string): Promise<any[]> {
  const res = await fetch(`${baseURL}/map-layers`);
  return res.json();
}

async function fetchDataTypes(baseURL: string, mode: "line" | "polygon") {
  const res = await fetch(`${baseURL}/${mode}/types`);
  return res.json();
}

export function useMapStateAPI(): StoreApi<MapState> {
  const storeAPI = useContext(MapStateContext);
  if (storeAPI == null) {
    throw new Error("No map state found");
  }
  return storeAPI;
}

export function useMapState<T>(selector: (state: MapState) => T): T {
  const store = useMapStateAPI();
  return useStore(store, selector);
}

export function useMapActions<T>(
  selector: (state: MapState["actions"]) => T,
): T {
  return useMapState<T>((state) => selector(state.actions));
}

function parseQueryParameters(): RecoverableMapState {
  const params = new URLSearchParams(window.location.search);
  let lyr = params.get("layer");
  const activeLayer = lyr == null ? null : parseInt(lyr);

  let baseMap: BasemapType =
    (params.get("base") as BasemapType) ?? BasemapType.Basic;
  if (
    [BasemapType.Satellite, BasemapType.Basic, BasemapType.Terrain].indexOf(
      baseMap,
    ) === -1
  ) {
    baseMap = BasemapType.Basic;
  }

  return { activeLayer, baseMap };
}

function setQueryParameters(params: RecoverableMapState) {
  const { activeLayer, baseMap } = params;
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete("layer");
  searchParams.delete("base");
  if (baseMap != BasemapType.Basic) {
    searchParams.set("base", baseMap);
  }
  if (activeLayer != null) {
    searchParams.set("layer", activeLayer.toString());
  }
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
  window.history.replaceState({}, "", newUrl);
}
