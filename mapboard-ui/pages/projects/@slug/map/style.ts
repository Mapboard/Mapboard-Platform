export function buildMap3DStyle(baseURL, selectedLayer = null) {
  console.log("Selected Layer: ", selectedLayer);
  let filter: any = ["!=", "map_layer", ""];
  if (selectedLayer != null) {
    filter = ["==", "map_layer", selectedLayer];
  }

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
        filter,
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
        filter,
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
        filter,
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
        filter,
      },
    ],
  };
}
