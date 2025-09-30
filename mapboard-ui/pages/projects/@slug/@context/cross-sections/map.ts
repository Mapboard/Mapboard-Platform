import hyper, { compose } from "@macrostrat/hyper";
import { Spinner } from "@blueprintjs/core";
import { postgrest } from "~/utils/api-client";

import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { Suspense, useEffect } from "react";
import styles from "./index.module.sass";
import { mapboxToken } from "~/settings";
import { useStyleImageManager } from "../style/pattern-manager";
import {
  MapboxMapProvider,
  useMapRef,
  useMapStyleOperator,
} from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { MapView } from "@macrostrat/map-interface";
import { BoundsLayer } from "~/client-components";
const h = hyper.styled(styles);
import { useCrossSectionStyle } from "./style";
import { unwrapMultiLineString } from "./utils";
import { crossSectionCursorDistanceAtom } from "./state";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { LineString } from "geojson";
import { getCrossSectionColor } from "./map-layer";

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
  const setCrossSectionID = useSetAtom(crossSectionIDAtom);
  const setCursorDistance = useSetAtom(crossSectionCursorDistanceAtom);

  useEffect(() => {
    setCrossSectionID(id);
    setCursorDistance(null);
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
          h(BoundsLayer, { bounds, visible: false, zoomToBounds: true }),
          h(CrossSectionHoverHandler, { positionData }),
          h(CrossSectionDistanceCursor, { positionData }),
        ],
      ),
    ]),
  );
}

function MapInner({ baseURL, mapboxToken, bounds, ...rest }) {
  const mapRef = useMapRef();

  useStyleImageManager();

  const style = useCrossSectionStyle(baseURL);
  if (style == null) {
    return null;
  }

  console.log("Setup style", style);

  const boundsArray = bbox(bounds);

  let aspectRatio = 1;
  const rect = mapRef?.current?.getContainer().getBoundingClientRect();
  if (rect != null) {
    const { width, height } = rect;
    aspectRatio = width / height;
  }

  return h(MapView, {
    bounds: boundsArray,
    //maxBounds: convertedBounds,
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

function CrossSectionDistanceCursor({
  positionData,
}: {
  positionData: CrossSectionPositionData;
}) {
  const [dist] = useAtom(crossSectionCursorDistanceAtom);

  useMapStyleOperator(
    (map) => {
      let src = map.getSource("cross-section-cursor");
      if (dist == null || positionData == null) {
        if (src != null) {
          src.setData({ type: "FeatureCollection", features: [] });
        }
      }
      const totalLength = positionData.length;
      const xPos = positionData.offset[0] + dist;

      const c0 = merc.inverse([xPos, positionData.offset[1] - 3500]);
      const c1 = merc.inverse([xPos, positionData.offset[1] + 3500]);

      const lineGeom = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [c0, c1],
        },
      };

      if (src == null) {
        const color = getCrossSectionColor();
        map.addSource("cross-section-cursor", {
          type: "geojson",
          data: lineGeom,
        });
        map.addLayer({
          id: "cross-section-cursor",
          source: "cross-section-cursor",
          type: "line",
          paint: {
            "line-color": color,
            "line-width": 3,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        });
      } else {
        src.setData(lineGeom);
      }
    },
    [dist, positionData],
  );

  return null;
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
        const xDistance = mercatorCoords[0] - positionData.offset[0];

        if (xDistance < 0 || xDistance > positionData.length) {
          setCursorDistance(null);
        } else {
          setCursorDistance(xDistance);
        }
      });
    },
    [setCursorDistance, positionData],
  );
  return null;
}

function convertBBoxToWebMercator(bbox: number[]) {
  const [minX, minY, maxX, maxY] = bbox;
  const [minX2, minY2] = merc.forward([minX, minY]);
  const [maxX2, maxY2] = merc.forward([maxX, maxY]);
  return [minX2, minY2, maxX2, maxY2];
}

function convertBBoxToEPSG4326(bbox: number[]) {
  const [minX, minY, maxX, maxY] = bbox;
  const [minX2, minY2] = merc.inverse([minX, minY]);
  const [maxX2, maxY2] = merc.inverse([maxX, maxY]);
  return [minX2, minY2, maxX2, maxY2];
}
