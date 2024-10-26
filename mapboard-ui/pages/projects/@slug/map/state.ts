import { createStore, useStore, StoreApi, create } from "zustand";
import { createContext, useContext, useState } from "react";
import h from "@macrostrat/hyper";

interface MapState {
  activeLayer: string | null;
  actions: {
    setActiveLayer: (layer: string) => void;
  };
}

const MapStateContext = createContext<StoreApi<MapState> | null>(null);

function createMapStore() {
  return createStore<MapState>((set, get) => ({
    activeLayer: null,
    actions: {
      setActiveLayer: (layer) => set({ activeLayer: layer }),
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
