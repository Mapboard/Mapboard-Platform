import { BasemapType, FeatureSelection } from "./state";
import { MapPosition } from "@macrostrat/mapbox-utils";
import { SelectionActionType } from "./selection";
import type { GeoJSONFeature, LngLat } from "mapbox-gl";
import { SourceChangeTimestamps } from "./style/overlay";
import { PolygonStyleIndex } from "./style/pattern-fills";

export interface RecoverableMapState {
  activeLayer: number | null;
  baseMap: BasemapType;
  mapPosition: MapPosition | null;
  activeCrossSection: number | null;
}

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
  toggleMapArea: () => void;
  toggleFeatureMode: (mode: FeatureMode) => void;
  setTerrainExaggeration: (exaggeration: number) => void;
  setMapPosition: (position: MapPosition) => void;
  toggleShowTopologyPrimitives: () => void;

  toggleShowFacesWithNoUnit(): void;

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
  FeatureMode.Fill,
]);

export interface PolygonDataType extends DataType {
  symbology?: {
    name: string;
    color?: string;
  };
}

export interface LocalStorageState {
  showCrossSectionLines: boolean;
  showLineEndpoints: boolean;
  showMapArea: boolean;
  showTopologyPrimitives: boolean;
  selectionFeatureMode: FeatureMode;
}

type LayerType = "dem" | "raster";

interface BaseLayer {
  name: string;
  description?: string;
  type: LayerType;
  url: string;
}

interface MapLayerState {
  activeLayer: number;
}

export interface CrossSectionsStore {
  crossSectionLines: GeoJSONFeature[];
  setCrossSectionLines: (lines: GeoJSONFeature[]) => void;
  showCrossSectionLines: boolean;
  toggleCrossSectionLines: () => void;
  activeCrossSection: number | null;
  setActiveCrossSection: (index: number | null) => void;
}

export type InitialMapState = RecoverableMapState &
  MapLayerState &
  Partial<StoredMapState>;

export type StoredMapState = RecoverableMapState &
  LocalStorageState &
  CrossSectionsStore;

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
