import hyper, { compose } from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { postgrest } from "~/utils/api-client";

import { atom, useAtom, Provider, useAtomValue } from "jotai";
import { Suspense, useEffect, useMemo, useState } from "react";

import styles from "./index.module.sass";
import { MapArea } from "../map";
import { mapboxToken } from "~/settings";
import { useStyleImageManager } from "../style/pattern-manager";
import { buildMapOverlayStyle, useBaseMapStyle } from "../style";
import { useMapRef } from "@macrostrat/mapbox-react";
import { MapAreaContainer, MapView } from "@macrostrat/map-interface";
import { bbox } from "@turf/bbox";
import { useMapState } from "../state";
import { mergeStyles } from "@macrostrat/mapbox-utils";
const h = hyper.styled(styles);

const crossSectionIDAtom = atom<number | null>(null);

const crossSectionDataAtom = atom(async (get) => {
  const id = get(crossSectionIDAtom);
  if (id == null) {
    return null;
  }
  return fetchCrossSectionMetadata(id);
});

export const CrossSectionAssistantMap = compose(
  Provider,
  _CrossSectionAssistantMap,
);

function _CrossSectionAssistantMap({ id }: { id: number }) {
  const [_, setCrossSectionID] = useAtom(crossSectionIDAtom);

  useEffect(() => {
    setCrossSectionID(id);
  }, [id]);

  return h(Suspense, { fallback: h(Spinner) }, h(CrossSectionAssistantInner));
}

function CrossSectionAssistantInner() {
  const ctx = useAtomValue(crossSectionDataAtom);

  const { name, id, slug, bounds } = ctx;

  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h("div.cross-section-assistant-map-holder", [
    h("h2", name),
    h(MapArea, {
      baseURL,
      bounds,
      isMapView: false,
      mapboxToken,
    }),
  ]);
}

async function fetchCrossSectionMetadata(id: number) {
  const res = await postgrest
    .from("context")
    .select()
    .eq("type", "cross-section")
    .eq("id", id)
    .single();

  if (res.error || !res.data) {
    throw res.error;
  }
  return res.data;
}

export function MapArea({
  mapboxToken = null,
  baseURL = null,
  bounds = null,
  isMapView = true,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
}) {
  return h(
    MapAreaContainer,
    {
      navbar: null,
      contextPanel: null,
      contextPanelOpen: false,
      fitViewport: false,
      //detailPanel: h("div.right-elements", [toolsCard, h(InfoDrawer)]),
      detailPanel: null,
      className: "cross-section-map",
    },
    [
      h(MapInner, {
        projection: { name: "mercator" },
        boxZoom: false,
        mapboxToken,
        bounds,
        fitBounds: !isMapView,
        maxZoom: 22,
        baseURL,
        isMapView,
      }),
    ],
  );
}

function MapInner({ baseURL, fitBounds, bounds, mapboxToken, ...rest }) {
  const mapRef = useMapRef();

  useStyleImageManager(mapRef);

  const style = useMapStyle(baseURL, {
    isMapView: false,
    mapboxToken,
  });
  if (style == null) {
    return null;
  }

  const boundsArray = bbox(bounds);

  console.log(bounds);

  let aspectRatio = 1;
  const rect = mapRef?.current?.getContainer().getBoundingClientRect();
  if (rect != null) {
    const { width, height } = rect;
    aspectRatio = width / height;
  }

  return h(MapView, {
    //maxBounds,
    bounds: boundsArray,
    //mapPosition: _mapPosition,
    mapboxToken,
    style,
    //onMapMoved: setMapPosition,
    ...rest,
  });
}

export function useMapStyle(
  baseURL: string,
  { mapboxToken, isMapView = true }: MapStyleOptions,
) {
  const basemapType = useMapState((state) => state.baseMap);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);

  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const showCrossSections = useMapState((d) => d.showCrossSectionLines);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useState(null);

  useEffect(() => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }
    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: null,
      sourceChangeTimestamps: [0],
      enabledFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
    });

    setOverlayStyle(style);
  }, [
    showLineEndpoints,
    enabledFeatureModes,
    showFacesWithNoUnit,
    showOverlay,
    showTopologyPrimitives,
    showCrossSections,
  ]);

  return useMemo(() => {
    if (baseStyleURL == null || overlayStyle == null) {
      return null;
    }

    const mainStyle: mapboxgl.StyleSpecification = {
      version: 8,
      name: "Mapboard",
      layers: [
        // We need to add this so that the style doesn't randomly reload
        {
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 0.0],
            "sky-atmosphere-sun-intensity": 15,
          },
        },
      ],
      sources: {},
    };

    const style = mergeStyles(overlayStyle, mainStyle);
    console.log("Setting style", style);
    return style;
  }, [baseStyleURL, overlayStyle, exaggeration]);
}
