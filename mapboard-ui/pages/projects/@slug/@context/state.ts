import { create, StoreApi, useStore } from "zustand";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import h from "@macrostrat/hyper";
import { devtools } from "zustand/middleware";
import { SelectionActionType } from "./selection";
import { PolygonStyleIndex } from "./style/pattern-fills";
import { SourceChangeTimestamps } from "./style/overlay";
import { MapPosition } from "@macrostrat/mapbox-react";
import { LocalStorage } from "@macrostrat/ui-components";
import {
  parseQueryParameters,
  RecoverableMapState,
  setQueryParameters
} from "./hash-string";
import type { LngLat } from "mapbox-gl";

interface MapActions {
  setActiveLayer: (layer: number | null) => void;
  setBaseMap: (baseMap: BasemapType) => void;
  selectFeatures: (selection: FeatureSelection | null) => void;
  toggleLayerPanel: () => void;
  setMapLayers: (layers: any[]) => void;
  setSelectionAction: (action: SelectionActionType | null) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  setSelectionFeatureMode: (mode: FeatureMode) => void;
  setSelectionActionState: (state: any) => void;
  setDataTypes: (mode: "line" | "polygon", types: DataType[]) => void;
  notifyChange: (mode: FeatureMode) => void;
  toggleLineEndpoints: () => void;
  toggleFeatureMode: (mode: FeatureMode) => void;
  setTerrainExaggeration: (exaggeration: number) => void;
  setMapPosition: (position: MapPosition) => void;
  toggleShowTopologyPrimitives: () => void;

  toggleShowFacesWithNoUnit(): void;

  toggleCrossSectionLines(): void;

  toggleOverlay(): void;

  setInspectPosition: (position: LngLat | null) => void;
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
  Fill = "fill",
}

export const allFeatureModes = new Set([
  FeatureMode.Line,
  FeatureMode.Polygon,
  FeatureMode.Fill
]);

export interface PolygonDataType extends DataType {
  symbology?: {
    name: string;
    color?: string;
  };
}

interface LocalStorageState {
  showCrossSectionLines: boolean;
  showLineEndpoints: boolean;
  showTopologyPrimitives: boolean;
  selectionFeatureMode: FeatureMode;
}

type StoredMapState = RecoverableMapState & LocalStorageState;

type LayerType = "dem" | "raster"

interface BaseLayer {
  name: string;
  description?: string;
  type: LayerType;
  url: string;
}

export interface MapState extends StoredMapState {
  actions: MapActions;
  layerPanelIsOpen: boolean;
  baseLayers: BaseLayer[];
  selection: FeatureSelection | null;
  selectionAction: SelectionActionState<any> | null;
  selectionMode: SelectionMode;
  enabledFeatureModes: Set<FeatureMode>;
  showOverlay: boolean;
  showFacesWithNoUnit: boolean;
  terrainExaggeration: number;
  mapLayers: MapLayer[] | null;
  mapLayerIDMap: Map<number, MapLayer>;
  apiBaseURL: string;
  // Time that we last updated the map elements
  lastChangeTime: SourceChangeTimestamps;
  dataTypes: {
    line: DataType[] | null;
    polygon: PolygonDataType[] | null;
  };
  polygonPatternIndex: PolygonStyleIndex | null;
  inspectPosition: LngLat | null;
}

const MapStateContext = createContext<StoreApi<MapState> | null>(null);

export enum BasemapType {
  Satellite = "satellite",
  Basic = "basic",
  Terrain = "terrain",
}

export type FeatureSelection = {
  type: FeatureMode;
  features: number[];
  dataTypes: Set<string>;
};

function createMapStore(
  baseURL: string,
  initialState: RecoverableMapState & Partial<StoredMapState>
) {
  return create<MapState>(
    // @ts-ignore
    devtools((set, get): MapState => {
      return {
        apiBaseURL: baseURL,
        layerPanelIsOpen: false,
        baseLayers: [],
        selection: null,
        selectionAction: null,
        selectionFeatureMode: FeatureMode.Line,
        selectionMode: SelectionMode.Replace,
        inspectPosition: null,
        mapLayers: null,
        enabledFeatureModes: allFeatureModes,
        showOverlay: true,
        showLineEndpoints: false,
        showCrossSectionLines: true,
        showFacesWithNoUnit: false,
        showTopologyPrimitives: false,
        terrainExaggeration: 1,
        lastChangeTime: {
          line: null,
          polygon: null,
          topology: null
        },
        dataTypes: {
          line: null,
          polygon: null
        },
        mapLayerIDMap: new Map(),
        polygonPatternIndex: null,
        ...initialState,
        actions: {
          setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
          setMapPosition: (mapPosition: MapPosition) => {
            console.log("Setting map position", mapPosition);
            set({ mapPosition });
          },
          setActiveLayer: (layer) =>
            set((state) => {
              // Toggle the active layer if it's already active
              let activeLayer: number | null = layer;
              if (state.activeLayer === layer) {
                activeLayer = null;
              }
              return { activeLayer, selection: null };
            }),
          notifyChange: (mode: FeatureMode) => {
            return set((state) => {
              return {
                lastChangeTime: {
                  ...state.lastChangeTime,
                  [mode]: Date.now()
                }
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
                  state.selectionMode
                ),
                inspectPosition: null
              };
            }),
          toggleLayerPanel: () =>
            set((state) => {
              return { layerPanelIsOpen: !state.layerPanelIsOpen };
            }),
          setMapLayers: (layers) =>
            set({
              mapLayers: layers,
              mapLayerIDMap: new Map(layers.map((l) => [l.id, l]))
            }),
          setDataTypes: (mode: "line" | "polygon", types: DataType[]) =>
            set((state) => {
              return {
                dataTypes: {
                  ...state.dataTypes,
                  [mode]: types
                }
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
                selectionAction: { ...selectionAction, state }
              };
            });
          },
          setSelectionFeatureMode: (mode) =>
            set({ selectionFeatureMode: mode }),
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
          toggleCrossSectionLines() {
            set((state) => {
              return { showCrossSectionLines: !state.showCrossSectionLines };
            });
          },
          toggleShowFacesWithNoUnit() {
            set((state) => {
              return { showFacesWithNoUnit: !state.showFacesWithNoUnit };
            });
          },
          toggleOverlay() {
            set((state) => {
              return { showOverlay: !state.showOverlay };
            });
          },
          setTerrainExaggeration: (exaggeration) => {
            set({ terrainExaggeration: exaggeration });
          },
          toggleShowTopologyPrimitives: () => {
            set((state) => {
              return { showTopologyPrimitives: !state.showTopologyPrimitives };
            });
          },
          setInspectPosition: (position) => {
            return set({ inspectPosition: position, selection: null });
          }
        }
      };
    })
  );
}

function combineFeatureSelection(
  selection: FeatureSelection | null,
  newSelection: FeatureSelection | null,
  mode: SelectionMode
): FeatureSelection | null {
  if (selection == null) {
    return newSelection;
  }
  if (newSelection == null) {
    return null;
  }

  let _mode = mode;
  if (selection.type !== newSelection.type) {
    _mode = SelectionMode.Replace;
  }


  switch (_mode) {
    case SelectionMode.Add:
      return {
        type: selection.type,
        features: [...selection.features, ...newSelection.features],
        dataTypes: new Set([...selection.dataTypes, ...newSelection.dataTypes])
      };
    case SelectionMode.Subtract:
      return {
        type: selection.type,
        features: selection.features.filter(
          (f) => !newSelection.features.includes(f)
        ),
        dataTypes: selection.dataTypes
      };
    case SelectionMode.Replace:
      return newSelection;
  }
}

function validateLocalStorageState(state: any): LocalStorageState | null {
  if (state == null || typeof state !== "object") {
    return null;
  }
  let selectionFeatureMode = state.selectionFeatureMode;
  if (
    selectionFeatureMode != null &&
    !allFeatureModes.has(selectionFeatureMode)
  ) {
    selectionFeatureMode = null;
  }

  return {
    showCrossSectionLines: state.showCrossSectionLines ?? true,
    showLineEndpoints: state.showLineEndpoints ?? false,
    showTopologyPrimitives: state.showTopologyPrimitives ?? false,
    selectionFeatureMode: selectionFeatureMode ?? FeatureMode.Line
  };
}

export function MapStateProvider({ children, baseURL, baseLayers }) {
  const storage = useRef(new LocalStorage<LocalStorageState>("map-state"));
  const storedState: Partial<LocalStorageState> =
    validateLocalStorageState(storage.current.get()) ?? {};

  const params = parseQueryParameters();

  const [value] = useState(() =>
    createMapStore(baseURL, { baseLayers, ...params, ...storedState })
  );

  /** Subscriber to set some values to the query parameters */
  useEffect(() => {
    return value.subscribe((state, prevState) => {
      const { activeLayer, baseMap, mapPosition } = state;
      if (
        activeLayer == prevState.activeLayer &&
        baseMap == prevState.baseMap &&
        mapPosition == prevState.mapPosition
      ) {
        return;
      }

      setQueryParameters({ activeLayer, baseMap, mapPosition });
    });
  }, []);

  /** Subscriber to set local storage state */
  useEffect(() => {
    return value.subscribe((state, prevState) => {
      const {
        showCrossSectionLines,
        showLineEndpoints,
        showTopologyPrimitives,
        selectionFeatureMode
      } = state;
      if (
        showCrossSectionLines != prevState.showCrossSectionLines ||
        showLineEndpoints != prevState.showLineEndpoints ||
        showTopologyPrimitives != prevState.showTopologyPrimitives ||
        selectionFeatureMode != prevState.selectionFeatureMode
      ) {
        storage.current.set({
          showCrossSectionLines,
          showLineEndpoints,
          showTopologyPrimitives,
          selectionFeatureMode
        });
      }
    });
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
  selector: (state: MapState["actions"]) => T
): T {
  return useMapState<T>((state) => selector(state.actions));
}
