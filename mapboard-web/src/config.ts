const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const sourceURL =
  import.meta.env.VITE_MAPBOARD_API || "http://localhost:8000/api";

console.log(mapboxToken);

export { mapboxToken, sourceURL };
