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
  setQueryParameters,
} from "./hash-string";

interface MapActions {
  setActiveLayer: (layer: number | null) => void;
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
  setTerrainExaggeration: (exaggeration: number) => void;
  setMapPosition: (position: MapPosition) => void;
  toggleShowTopologyPrimitives: () => void;

  toggleShowFacesWithNoUnit(): void;

  toggleCrossSectionLines(): void;

  toggleOverlay(): void;
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
}

type StoredMapState = RecoverableMapState & LocalStorageState;

export interface MapState extends StoredMapState {
  actions: MapActions;
  layerPanelIsOpen: boolean;
  selection: FeatureSelection | null;
  selectionAction: SelectionActionState<any> | null;
  selectionMode: SelectionMode;
  selectionFeatureMode: FeatureMode;
  enabledFeatureModes: Set<FeatureMode>;
  showOverlay: boolean;
  showFacesWithNoUnit: boolean;
  terrainExaggeration: number;
  mapLayers: MapLayer[] | null;
  mapLayerIDMap: Map<number, MapLayer>;
  terrainSource: string;
  apiBaseURL: string;
  // Time that we last updated the map elements
  lastChangeTime: SourceChangeTimestamps;
  dataTypes: {
    line: DataType[] | null;
    polygon: PolygonDataType[] | null;
  };
  polygonPatternIndex: PolygonStyleIndex | null;
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
  faces: number[];
  lineTypes?: Set<string>;
  polygonTypes?: Set<string>;
  faceTypes?: Set<string>;
};

function createMapStore(
  baseURL: string,
  initialState: RecoverableMapState & Partial<StoredMapState>,
) {
  return create<MapState>(
    // @ts-ignore
    devtools((set, get): MapState => {
      return {
        apiBaseURL: baseURL,
        layerPanelIsOpen: false,
        selection: null,
        selectionAction: null,
        selectionFeatureMode: FeatureMode.Line,
        selectionMode: SelectionMode.Replace,
        mapLayers: null,
        enabledFeatureModes: allFeatureModes,
        showOverlay: true,
        showLineEndpoints: false,
        showCrossSectionLines: true,
        showFacesWithNoUnit: false,
        showTopologyPrimitives: false,
        terrainExaggeration: 1,
        terrainSource: "mapbox://mapbox.terrain-rgb",
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

function validateLocalStorageState(state: any): LocalStorageState | null {
  if (state == null || typeof state !== "object") {
    return null;
  }
  return {
    showCrossSectionLines: state.showCrossSectionLines ?? true,
    showLineEndpoints: state.showLineEndpoints ?? false,
    showTopologyPrimitives: state.showTopologyPrimitives ?? false,
  };
}

export function MapStateProvider({ children, baseURL }) {
  const storage = useRef(new LocalStorage<LocalStorageState>("map-state"));
  const storedState: Partial<LocalStorageState> =
    validateLocalStorageState(storage.current.get()) ?? {};

  const params = parseQueryParameters();

  const [value] = useState(() =>
    createMapStore(baseURL, { ...params, ...storedState }),
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
      } = state;
      if (
        showCrossSectionLines != prevState.showCrossSectionLines ||
        showLineEndpoints != prevState.showLineEndpoints ||
        showTopologyPrimitives != prevState.showTopologyPrimitives
      ) {
        storage.current.set({
          showCrossSectionLines,
          showLineEndpoints,
          showTopologyPrimitives,
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
  selector: (state: MapState["actions"]) => T,
): T {
  return useMapState<T>((state) => selector(state.actions));
}
