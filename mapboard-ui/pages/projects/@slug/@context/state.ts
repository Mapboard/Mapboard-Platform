import { create, StoreApi, useStore } from "zustand";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import h from "@macrostrat/hyper";
import { devtools } from "zustand/middleware";
import { MapPosition } from "@macrostrat/mapbox-react";
import { LocalStorage } from "@macrostrat/ui-components";
import { parseQueryParameters, setQueryParameters } from "./hash-string";
import {
  allFeatureModes,
  DataType,
  FeatureMode,
  LocalStorageState,
  MapState,
  SelectionMode,
  InitialMapState,
  CrossSectionsStore,
  StyleMode,
} from "./types";
import { fetchCrossSections } from "./cross-sections";
import { Context } from "~/types";
import { GeoJSONFeature } from "mapbox-gl";
import { atomWithStore } from "jotai-zustand";

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

type MapStoreApi = StoreApi<MapState>;

function createCrossSectionsSlice(
  set: MapStoreApi["setState"],
  get: MapStoreApi["getState"],
): CrossSectionsStore {
  return {
    crossSectionLines: [],
    showCrossSectionLines: false,
    activeCrossSection: null,
    toggleCrossSectionLines() {
      set((state) => {
        return { showCrossSectionLines: !state.showCrossSectionLines };
      });
    },
    setCrossSectionLines: (lines: any) => set({ crossSectionLines: lines }),
    setActiveCrossSection: (index: number | null) =>
      set({ activeCrossSection: index }),
  };
}

function createMapStore(baseURL: string, initialState: InitialMapState) {
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
        inspect: null,
        mapLayers: null,
        enabledFeatureModes: allFeatureModes,
        showOverlay: true,
        showLineEndpoints: false,
        showMapArea: false,
        showFacesWithNoUnit: false,
        showTopologyPrimitives: false,
        terrainExaggeration: 1,
        styleMode: "display",
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
        ...createCrossSectionsSlice(set, get),
        ...initialState,
        actions: {
          setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
          setMapPosition: (mapPosition: MapPosition) => {
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
                inspect: null,
              };
            }),
          toggleLayerPanel: () =>
            set((state) => {
              return { layerPanelIsOpen: !state.layerPanelIsOpen };
            }),
          toggleMapArea: () =>
            set((state) => {
              return { showMapArea: !state.showMapArea };
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
          setInspectPosition: (position, targetFeatures: GeoJSONFeature[]) => {
            let inspect = null;
            if (position != null) {
              inspect = {
                position,
                tileFeatureData: targetFeatures,
              };
            }
            return set({ inspect, selection: null });
          },
          setStyleMode(styleMode: StyleMode) {
            return set({ styleMode });
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

  let _mode = mode;
  if (selection.type !== newSelection.type) {
    _mode = SelectionMode.Replace;
  }

  switch (_mode) {
    case SelectionMode.Add:
      return {
        type: selection.type,
        features: [...selection.features, ...newSelection.features],
        dataTypes: new Set([...selection.dataTypes, ...newSelection.dataTypes]),
      };
    case SelectionMode.Subtract:
      return {
        type: selection.type,
        features: selection.features.filter(
          (f) => !newSelection.features.includes(f),
        ),
        dataTypes: selection.dataTypes,
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
    selectionFeatureMode: selectionFeatureMode ?? FeatureMode.Line,
    showMapArea: state.showMapArea ?? false,
    styleMode: state.styleMode ?? "display",
  };
}

interface MapStateProviderProps {
  children: React.ReactNode;
  baseURL: string;
  baseLayers?: any[];
  defaultLayer?: number | null;
  context: Context;
}

export function MapStateProvider({
  children,
  baseURL,
  baseLayers,
  defaultLayer,
  context,
}: MapStateProviderProps) {
  const storage = useRef(new LocalStorage<LocalStorageState>("map-state"));
  const storedState: Partial<LocalStorageState> =
    validateLocalStorageState(storage.current.get()) ?? {};

  const params = parseQueryParameters();

  let baseState = { ...storedState, ...params };
  if (baseState.activeCrossSection != null) {
    baseState.showCrossSectionLines = true;
  }

  const [value] = useState(() =>
    createMapStore(baseURL, {
      baseLayers,
      ...baseState,
      activeLayer: baseState.activeLayer ?? defaultLayer,
    }),
  );

  /** Subscriber to set some values to the query parameters */
  useEffect(() => {
    return value.subscribe((state, prevState) => {
      const { activeLayer, baseMap, mapPosition, activeCrossSection } = state;
      if (
        activeLayer == prevState.activeLayer &&
        baseMap == prevState.baseMap &&
        mapPosition == prevState.mapPosition &&
        activeCrossSection == prevState.activeCrossSection
      ) {
        return;
      }

      setQueryParameters({
        activeLayer,
        baseMap,
        mapPosition,
        activeCrossSection,
      });
    });
  }, []);

  /** Subscriber to set local storage state */
  useEffect(() => {
    return value.subscribe((state, prevState) => {
      const {
        showCrossSectionLines,
        showLineEndpoints,
        showTopologyPrimitives,
        selectionFeatureMode,
        styleMode,
      } = state;
      if (
        showCrossSectionLines != prevState.showCrossSectionLines ||
        showLineEndpoints != prevState.showLineEndpoints ||
        showTopologyPrimitives != prevState.showTopologyPrimitives ||
        selectionFeatureMode != prevState.selectionFeatureMode ||
        state.showMapArea != prevState.showMapArea ||
        state.styleMode != prevState.styleMode
      ) {
        storage.current.set({
          showCrossSectionLines,
          showLineEndpoints,
          showTopologyPrimitives,
          selectionFeatureMode,
          showMapArea: state.showMapArea,
          styleMode,
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

  const setCrossSectionLines = value((state) => state.setCrossSectionLines);
  // Fetch cross section lines
  useEffect(() => {
    fetchCrossSections(context.id).then(setCrossSectionLines);
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
