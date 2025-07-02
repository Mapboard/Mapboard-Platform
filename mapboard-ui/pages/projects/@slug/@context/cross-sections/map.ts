import hyper, { compose } from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { postgrest } from "~/utils/api-client";

import { atom, useAtom, Provider, useAtomValue } from "jotai";
import { Suspense, useEffect } from "react";
import styles from "./index.module.sass";
import { mapboxToken } from "~/settings";
import { useStyleImageManager } from "../style/pattern-manager";
import { MapboxMapProvider, useMapRef } from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { MapView } from "@macrostrat/map-interface";
import { BoundsLayer } from "~/client-components";
const h = hyper.styled(styles);
import { useCrossSectionStyle } from "./style";

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
    h(CrossSectionMapArea, {
      baseURL,
      bounds, // Default bounds for cross-section

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

function CrossSectionMapArea({
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
    MapboxMapProvider,
    h("div.cross-section-container", [
      h(
        MapInner,
        {
          projection: { name: "mercator" },
          boxZoom: false,
          mapboxToken,
          bounds,
          baseURL,
          isMapView: false,
        },
        [h(BoundsLayer, { bounds, visible: true, zoomToBounds: true })],
      ),
    ]),
  );
}

function MapInner({ baseURL, mapboxToken, bounds, ...rest }) {
  const mapRef = useMapRef();

  useStyleImageManager(mapRef);

  const style = useCrossSectionStyle(baseURL, {
    isMapView: false,
    mapboxToken,
  });
  if (style == null) {
    return null;
  }

  const boundsArray = bbox(bounds);

  let aspectRatio = 1;
  const rect = mapRef?.current?.getContainer().getBoundingClientRect();
  if (rect != null) {
    const { width, height } = rect;
    aspectRatio = width / height;
  }

  return h(MapView, {
    bounds: boundsArray,
    //mapPosition: _mapPosition,
    mapboxToken,
    style,
    enableTerrain: false,
    maxZoom: 22,
    pitchWithRotate: false,
    //standalone: true,
    //onMapMoved: setMapPosition,
    ...rest,
  });
}
