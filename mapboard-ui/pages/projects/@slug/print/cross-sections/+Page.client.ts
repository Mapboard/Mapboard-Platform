import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import hyper from "@macrostrat/hyper";

import { useMemo } from "react";
import styles from "./+Page.client.module.sass";
import { mapboxToken } from "~/settings";
import { useStyleImageManager } from "../../@context/style/pattern-manager";
import { MapboxMapProvider, useMapRef } from "@macrostrat/mapbox-react";
import { bbox } from "@turf/bbox";
import { MapView } from "@macrostrat/map-interface";
import { BoundsLayer } from "~/client-components";
import { buildCrossSectionStyle } from "../../@context/cross-sections/style";
import { LineString } from "geojson";

const h = hyper.styled(styles);

export function Page() {
  const crossSections = useData<Data>() ?? [];

  return h(
    "div.cross-sections",
    crossSections.map((ctx) => {
      let domain = document.location.origin;
      const { project_slug, slug, bounds } = ctx;
      const baseURL = `${domain}/api/project/${project_slug}/context/${slug}`;

      return h("div.cross-section", [
        h("h2.cross-section-title", ctx.name),
        h(CrossSectionMapArea, {
          baseURL,
          bounds,
          isMapView: false,
          mapboxToken,
        }),
      ]);
    }),
  );
}

interface CrossSectionPositionData {
  length: number;
  parentGeom: LineString;
  offset: [number, number];
}

function CrossSectionMapArea({
  mapboxToken = null,
  baseURL = null,
  bounds = null,
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
        [h(BoundsLayer, { bounds, visible: true, zoomToBounds: true })],
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
    mapboxToken,
    style,
    enableTerrain: false,
    maxZoom: 22,
    pitchWithRotate: false,
    antialias: false,
    optimizeForTerrain: false,
    dragRotate: false,
    touchPitch: false,
    ...rest,
  });
}
