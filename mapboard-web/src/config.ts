const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const sourceURL =
  import.meta.env.GEOLOGIC_MAP_ADDRESS || "http://localhost:3006";

console.log(mapboxToken);

export { mapboxToken, sourceURL };
