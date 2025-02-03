import { createStore, useStore, StoreApi, create } from "zustand";
import { createContext, useContext, useState } from "react";
import h from "@macrostrat/hyper";

interface MapState {
  activeLayer: string | null;
  actions: {
    setActiveLayer: (layer: string) => void;
    setBaseMap: (baseMap: BasemapType) => void;
  };
  layerPanelIsOpen: boolean;
  baseMap: BasemapType;
}

const MapStateContext = createContext<StoreApi<MapState> | null>(null);

export enum BasemapType {
  Satellite = "satellite",
  Basic = "basic",
  Terrain = "terrain",
}

function createMapStore() {
  return createStore<MapState>((set, get) => ({
    activeLayer: null,
    layerPanelIsOpen: false,
    baseMap: BasemapType.Basic,
    actions: {
      setBaseMap: (baseMap: BasemapType) => set({ baseMap }),
      setActiveLayer: (layer) =>
        set((state) => {
          // Toggle the active layer if it's already active
          let activeLayer: string | null = layer;
          if (state.activeLayer === layer) {
            activeLayer = null;
          }
          return { activeLayer };
        }),
      toggleLayerPanel: () =>
        set((state) => {
          return { layerPanelIsOpen: !state.layerPanelIsOpen };
        }),
    },
  }));
}

export function MapStateProvider({ children }) {
  const [value] = useState(createMapStore);

  return h(MapStateContext.Provider, { value }, children);
}

export function useMapState(selector: (state: MapState) => any) {
  const store = useContext(MapStateContext);
  if (store == null) {
    throw new Error("No map state found");
  }
  return useStore(store, selector);
}

export function useMapActions() {
  const store = useContext(MapStateContext);
  if (store == null) {
    throw new Error("No map state found");
  }
  return store.getState().actions;
}
