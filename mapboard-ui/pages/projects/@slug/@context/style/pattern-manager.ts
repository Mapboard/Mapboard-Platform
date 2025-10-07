import { useEffect } from "react";
import { createSolidColorImage, loadImage } from "./pattern-images";
import { useMapInitialized, useMapRef } from "@macrostrat/mapbox-react";

export function useStyleImageManager() {
  const isInitialized = useMapInitialized();
  const mapRef = useMapRef();

  // Handle pattern symbols by loading them only once they are reported missing
  useEffect(() => {
    const map = mapRef.current;
    if (map == null) return;

    const styleImageMissing = (e) => {
      loadStyleImage(map, e.id)
        .catch((err) => {
          console.error(`Failed to load pattern image for ${e.id}:`, err);
        })
        .then(() => {});
    };

    // Register the event listener for missing images
    map.on("styleimagemissing", styleImageMissing);
    return () => {
      // Clean up the event listener when the component unmounts
      map.off("styleimagemissing", styleImageMissing);
    };
  }, [isInitialized]);
}

async function loadStyleImage(map: mapboxgl.Map, id: string) {
  const [prefix, name, ...rest] = id.split(":");

  //console.log("Loading style image:", id, prefix, name, rest);

  if (prefix == "point") {
    await loadSymbolImage(map, "geologic-symbols/points/strabospot", id);
  } else if (prefix == "line-symbol") {
    // Load line symbol image
    await loadSymbolImage(map, "geologic-symbols/lines/dev", id);
  } else {
    // Load pattern image
    await loadPatternImage(map, id);
  }
}

async function loadSymbolImage(map: mapboxgl.Map, set: string, id: string) {
  const [prefix, name, ...rest] = id.split(":");
  const lineSymbolsURL = `https://dev.macrostrat.org/assets/web/${set}/png`;
  if (map.hasImage(id)) return;
  const image = await loadImage(lineSymbolsURL + `/${name}.png`);
  if (map.hasImage(id) || image == null) return;
  map.addImage(id, image, { sdf: true, pixelRatio: 3 });
}

async function loadPatternImage(map: mapboxgl.Map, patternSpec: string) {
  if (map.hasImage(patternSpec)) return;
  const image = await buildPatternImage(patternSpec);
  if (map.hasImage(patternSpec) || image == null) return;

  map.addImage(patternSpec, image, {
    pixelRatio: 2, // Use a higher pixel ratio for better quality
  });
}

async function buildPatternImage(
  patternSpec: string,
): Promise<HTMLImageElement | ImageData | null> {
  const [prefix, ...rest] = patternSpec.split(":");
  if (prefix == "fgdc") {
    const [name, color, backgroundColor] = rest;

    const urlParams = new URLSearchParams();
    urlParams.set("scale", "4");
    if (backgroundColor) {
      urlParams.set("background-color", backgroundColor);
    }
    if (color) {
      urlParams.set("color", color);
    }

    const url = `/styles/pattern/${name}.png?${urlParams.toString()}`;
    return await loadImage(url);
  } else if (prefix == "color") {
    // Create a solid color image
    const color = rest[0];
    return createSolidColorImage(color);
  }
  return null;
}
