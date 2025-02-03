import { createStore, useStore, StoreApi, create } from "zustand";
import { createContext, useContext, useEffect, useState } from "react";
import h from "@macrostrat/hyper";
import { subscribeWithSelector } from "zustand/middleware";

interface RecoverableMapState {
  activeLayer: number | null;
  baseMap: BasemapType;
}

interface MapState extends RecoverableMapState {
  actions: {
    setActiveLayer: (layer: number) => void;
    setBaseMap: (baseMap: BasemapType) => void;
    selectFeatures: (selection: FeatureSelection) => void;
    toggleLayerPanel: () => void;
  };
  layerPanelIsOpen: boolean;
  selection: FeatureSelection | null;
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

const _subscribeWithSelector = subscribeWithSelector as any;

function createMapStore() {
  return create<MapState>(
    _subscribeWithSelector((set, get): MapState => {
      const { activeLayer, baseMap } = parseQueryParameters();
      return {
        activeLayer,
        baseMap,
        layerPanelIsOpen: false,
        selection: null,
        actions: {
          setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
          setActiveLayer: (layer) =>
            set((state) => {
              // Toggle the active layer if it's already active
              let activeLayer: string | null = layer;
              if (state.activeLayer === layer) {
                activeLayer = null;
              }
              return { activeLayer, selection: null };
            }),
          selectFeatures: (selection) => set({ selection }),
          toggleLayerPanel: () =>
            set((state) => {
              return { layerPanelIsOpen: !state.layerPanelIsOpen };
            }),
        },
      };
    }),
  );
}

export function MapStateProvider({ children }) {
  const [value] = useState(createMapStore);
  useEffect(() => {
    const unsubscribe = value.subscribe(
      (state) => [state.activeLayer, state.baseMap],
      ([activeLayer, baseMap]) => {
        setQueryParameters({ activeLayer, baseMap });
      },
    );
    return unsubscribe;
  }, []);
  return h(MapStateContext.Provider, { value }, [children]);
}

export function useMapState(selector: (state: MapState) => any) {
  const store = useContext(MapStateContext);
  if (store == null) {
    throw new Error("No map state found");
  }
  return useStore(store, selector);
}

export function useMapActions(selector: (state: MapState["actions"]) => any) {
  return useMapState((state) => selector(state.actions));
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
