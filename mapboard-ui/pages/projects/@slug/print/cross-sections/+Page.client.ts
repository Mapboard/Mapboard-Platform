import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import { bbox } from "@turf/bbox";

import hyper, { compose } from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { postgrest } from "~/utils/api-client";

import { atom, useAtom, useAtomValue } from "jotai";
import { Suspense, useEffect, useMemo } from "react";
import styles from "./+Page.client.module.sass";
import { mapboxToken } from "~/settings";
import { useStyleImageManager } from "../../@context/style/pattern-manager";
import {
  MapboxMapProvider,
  useMapRef,
  useMapStyleOperator,
} from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { MapView } from "@macrostrat/map-interface";
import { BoundsLayer } from "~/client-components";
const h = hyper.styled(styles);
import {
  buildCrossSectionStyle,
  useCrossSectionStyle,
} from "../../@context/cross-sections/style";
import { unwrapMultiLineString } from "../../@context/cross-sections/utils";
import { crossSectionCursorDistanceAtom } from "../../@context/cross-sections/state";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { LineString } from "geojson";
import { useParams } from "~/utils/routing";

export function Page() {
  const crossSections = useData<Data>() ?? [];
  const { slug } = useParams();

  return h(
    "div.cross-sections",
    crossSections.map((ctx) => {
      let domain = document.location.origin;
      const { project_slug, slug, bounds } = ctx;
      const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;
      const positionData = {
        length: ctx.length,
        parentGeom: unwrapMultiLineString(ctx.parent_geom),
        offset: [ctx.offset_x || 0, ctx.offset_y || 0],
      };

      return h("div.cross-section", [
        h("h2.cross-section-title", ctx.name),
        h(CrossSectionMapArea, {
          baseURL,
          bounds,
          positionData,
          isMapView: false,
          mapboxToken,
        }),
      ]);
    }),
  );
}

const merc = new SphericalMercator({
  size: 256,
});

const crossSectionIDAtom = atom<number | null>(null);

const crossSectionDataAtom = atom(async (get) => {
  const id = get(crossSectionIDAtom);
  if (id == null) {
    return null;
  }
  return fetchCrossSectionMetadata(id);
});

export const CrossSectionAssistantMap = compose(_CrossSectionAssistantMap);

function _CrossSectionAssistantMap({ id }: { id: number }) {
  const [_, setCrossSectionID] = useAtom(crossSectionIDAtom);

  useEffect(() => {
    setCrossSectionID(id);
  }, [id]);

  return h(Suspense, { fallback: h(Spinner) }, h(CrossSectionAssistantInner));
}

interface CrossSectionPositionData {
  length: number;
  parentGeom: LineString;
  offset: [number, number];
}

function CrossSectionAssistantInner() {
  const ctx = useAtomValue(crossSectionDataAtom);

  const { name, id, bounds, slug, project_slug } = ctx;

  const positionData = {
    length: ctx.length,
    parentGeom: unwrapMultiLineString(ctx.parent_geom),
    offset: [ctx.offset_x || 0, ctx.offset_y || 0],
  };

  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

  return h("div.cross-section-assistant-map-holder", [
    h("h2", name),
    h(CrossSectionMapArea, {
      baseURL,
      bounds, // Default bounds for cross-section
      positionData,
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
  positionData,
}: {
  headerElement?: React.ReactElement;
  transformRequest?: mapboxgl.TransformRequestFunction;
  children?: React.ReactNode;
  mapboxToken?: string | null;
  baseURL: string;
  focusedSource?: string;
  focusedSourceTitle?: string;
  isMapView: boolean;
  positionData: CrossSectionPositionData;
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
        [
          h(BoundsLayer, { bounds, visible: true, zoomToBounds: true }),
          h(CrossSectionHoverHandler, { positionData }),
        ],
      ),
    ]),
  );
}

function MapInner({ baseURL, mapboxToken, bounds, ...rest }) {
  const mapRef = useMapRef();

  useStyleImageManager();

  const style = useMemo(() => {
    return buildCrossSectionStyle(baseURL, {
      showFacesWithNoUnit: true,
      showLineEndpoints: false,
      showTopologyPrimitives: false,
    });
  }, [baseURL]);

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
    antialias: false,
    optimizeForTerrain: false,
    dragRotate: false,
    touchPitch: false,
    //standalone: true,
    //onMapMoved: setMapPosition,
    ...rest,
  });
}

function CrossSectionHoverHandler({
  positionData,
}: {
  positionData: CrossSectionPositionData;
}) {
  const [dist, setCursorDistance] = useAtom(crossSectionCursorDistanceAtom);
  useMapStyleOperator(
    (map) => {
      map.on("mousemove", (e) => {
        // Get x/y position of cursor in lat/lon
        const coords = e.lngLat;
        const mercatorCoords = merc.forward([coords.lng, coords.lat]);

        const totalLength = positionData.length;
        const xProportion =
          (mercatorCoords[0] - positionData.offset[0]) / totalLength;

        if (xProportion < 0 || xProportion > 1) {
          setCursorDistance(null);
        } else {
          setCursorDistance(xProportion);
        }
      });
    },
    [setCursorDistance, positionData],
  );
  return null;
}
