import mapboxgl from "mapbox-gl";
const mapboxToken = import.meta.env.MAPBOX_TOKEN;
const sourceURL =
  import.meta.env.GEOLOGIC_MAP_ADDRESS || "http://localhost:3006";
mapboxgl.accessToken = mapboxToken;

export { mapboxToken, sourceURL };
