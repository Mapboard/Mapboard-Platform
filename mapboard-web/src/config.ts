const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const sourceURL =
  import.meta.env.GEOLOGIC_MAP_ADDRESS || "http://localhost:8000/api";

console.log(mapboxToken);

export { mapboxToken, sourceURL };
