import { useStore, StoreApi, create } from "zustand";
import { createContext, useContext, useEffect, useState } from "react";
import h from "@macrostrat/hyper";
import { subscribeWithSelector, devtools } from "zustand/middleware";
import { SelectionActionType } from "./selection";
import { PolygonStyleIndex } from "./style/pattern-fills";
import { SourceChangeTimestamps } from "./style/overlay";
import { MapPosition } from "@macrostrat/mapbox-react";
import { applyMapPositionToHash } from "@macrostrat/map-interface";
import { getMapPositionForHash } from "./hash-string";

interface RecoverableMapState {
  activeLayer: number | null;
  baseMap: BasemapType;
  mapPosition: MapPosition | null;
}

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

export interface MapState extends RecoverableMapState {
  actions: MapActions;
  layerPanelIsOpen: boolean;
  selection: FeatureSelection | null;
  selectionAction: SelectionActionState<any> | null;
  selectionMode: SelectionMode;
  enabledFeatureModes: Set<FeatureMode>;
  showOverlay: boolean;
  showLineEndpoints: boolean;
  showCrossSectionLines: boolean;
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
  lineTypes?: Set<string>;
  polygons: number[];
  polygonTypes?: Set<string>;
};

const _subscribeWithSelector = subscribeWithSelector as <T>(fn: T) => T;

function createMapStore(baseURL: string) {
  return create<MapState>(
    // @ts-ignore
    _subscribeWithSelector(
      devtools((set, get): MapState => {
        const { activeLayer, baseMap, mapPosition } = parseQueryParameters();
        return {
          apiBaseURL: baseURL,
          activeLayer,
          baseMap,
          layerPanelIsOpen: false,
          selection: null,
          selectionAction: null,
          selectionMode: SelectionMode.Replace,
          mapLayers: null,
          mapPosition,
          enabledFeatureModes: allFeatureModes,
          showOverlay: true,
          showLineEndpoints: false,
          showCrossSectionLines: true,
          showFacesWithNoUnit: false,
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
          actions: {
            setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
            setMapPosition: (mapPosition: MapPosition) => set({ mapPosition }),
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
          },
        };
      }),
    ),
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

  /** Subscriber to set some values to the query parameters */
  useEffect(() => {
    const unsubscribe = value.subscribe(
      (state) => [state.activeLayer, state.baseMap, state.mapPosition],
      ([activeLayer, baseMap, mapPosition]) => {
        setQueryParameters({ activeLayer, baseMap, mapPosition });
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

  const mapPosition = getMapPositionForHash(params, null);

  return { activeLayer, baseMap, mapPosition };
}

function setQueryParameters(params: RecoverableMapState) {
  const { activeLayer, baseMap, mapPosition } = params;
  if (mapPosition == null) return;
  const searchParams = new URLSearchParams();
  if (baseMap != BasemapType.Basic) {
    searchParams.set("base", baseMap);
  }
  if (activeLayer != null) {
    searchParams.set("layer", activeLayer.toString());
  }

  if (mapPosition != null) {
    let args = {};
    applyMapPositionToHash(args, mapPosition);
    for (let [k, v] of Object.entries(args)) {
      searchParams.set(k, v);
    }
  }

  let paramsString = searchParams.toString();
  if (paramsString.length > 0) {
    paramsString = `?${paramsString}`;
  }

  const newUrl = `${window.location.pathname}${paramsString}`;
  window.history.replaceState({}, "", newUrl);
}
