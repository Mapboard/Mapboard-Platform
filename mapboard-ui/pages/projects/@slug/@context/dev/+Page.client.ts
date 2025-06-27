import hyper from "@macrostrat/hyper";
import styles from "../map.module.scss";
import { apiDomain, mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../state";
import { bbox } from "@turf/bbox";
import { MapInspectorV2 } from "@macrostrat/map-interface";
import { useMapStyle, useMapSymbols } from "../style";
import { useEffect, useState } from "react";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  const baseURL = `${apiDomain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    MapStateProvider,
    { baseURL },
    h(PageInner, { baseURL, context: ctx }),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const isMapContext = ctx.type === "map";

  const [style, setStyle] = useState(null);

  let bounds = null;
  // We might not have any bounds yet, though this should probably be required...
  if (ctx.bounds) {
    bounds = bbox(ctx.bounds);
  }

  return h(
    MapInspectorV2,
    {
      style,
      bounds,
      mapboxToken,
      title: ctx.name + " – Inspector",
    },
    h(MapStyleLoader, { baseURL, isMapContext, setStyle }),
  );
}

function MapStyleLoader({ baseURL, setStyle, isMapContext }: any) {
  /** The style object has to be generated with access to the map object,
   * to allow symbols to be loaded. Thus, it must be nested within the
   * MapContextProvider
   */
  const style = useMapStyle(baseURL, {
    mapboxToken,
    isMapView: isMapContext,
  });

  useEffect(() => {
    setStyle(style);
  }, [style]);
  return null;
}
