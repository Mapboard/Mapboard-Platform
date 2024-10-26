import h from "@macrostrat/hyper";
import { DevMapPage } from "@macrostrat/map-interface";
import { useAPIResult } from "@macrostrat/ui-components";
import { mapboxToken, apiDomain } from "~/settings";
import { Data } from "../+data";

import { useData } from "vike-react/useData";
import { useMemo } from "react";

function buildMap3DStyle(baseURL) {
  return {
    version: 8,
    sources: {
      mapboard_polygon: {
        type: "vector",
        tiles: [baseURL + "/polygon/tile/{z}/{x}/{y}"],
        volatile: true,
      },
      mapboard_line: {
        type: "vector",
        tiles: [baseURL + "/line/tile/{z}/{x}/{y}"],
        volatile: true,
      },
      mapboard_topology: {
        type: "vector",
        tiles: [baseURL + "/topology/tile/{z}/{x}/{y}"],
        volatile: true,
      },
    },
    layers: [
      {
        id: "topology",
        type: "fill",
        source: "mapboard_topology",
        "source-layer": "faces",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.2,
        },
      },
      {
        id: "polygons",
        type: "fill",
        source: "mapboard_polygon",
        "source-layer": "polygons",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.5,
        },
      },
      {
        id: "lines",
        type: "line",
        source: "mapboard_line",
        "source-layer": "lines",
        paint: {
          "line-color": "#000000",
          "line-width": 1.5,
        },
      },
      {
        id: "points",
        type: "circle",
        source: "mapboard_line",
        "source-layer": "endpoints",
        paint: {
          "circle-color": "#000000",
          "circle-radius": 1,
        },
      },
    ],
  };
}

export function Page() {
  const project = useData<Data>();

  const baseURL = `${apiDomain}/api/project/${project.slug}`;

  const overlayStyle = useMemo(() => buildMap3DStyle(baseURL), [baseURL]);

  // const bounds = meta.projectBounds ?? [-135, 60, -132, 67];
  //
  // console.log(meta, bounds);
  //
  // // Get camera params
  // const camera = {
  //   lat: (bounds[1] + bounds[3]) / 2,
  //   lng: (bounds[0] + bounds[2]) / 2,
  //   altitude: 150000,
  // };

  return h(DevMapPage, {
    mapboxToken,
    overlayStyle,
    //mapPosition: { camera },
    //style,
  });
}
