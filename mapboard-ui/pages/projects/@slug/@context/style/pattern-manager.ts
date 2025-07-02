import { useEffect } from "react";
import { createSolidColorImage, loadImage } from "./pattern-images";
import { useMapInitialized, useMapRef } from "@macrostrat/mapbox-react";

export function useStyleImageManager() {
  const isInitialized = useMapInitialized();
  const mapRef = useMapRef();
  useEffect(() => {
    const map = mapRef.current;
    if (map == null) return;

    const styleImageMissing = (e) => {
      loadStyleImage(map, e.id)
        .catch((err) => {
          console.error(`Failed to load pattern image for ${id}:`, err);
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
  if (prefix == "line-symbol") {
    // Load line symbol image
    await loadLineSymbolImage(map, id);
  } else {
    // Load pattern image
    await loadPatternImage(map, id);
  }
}

async function loadLineSymbolImage(map: mapboxgl.Map, id: string) {
  const [prefix, name, ...rest] = id.split(":");
  const vizBaseURL = "//visualization-assets.s3.amazonaws.com";
  const lineSymbolsURL = vizBaseURL + "/geologic-line-symbols/png";
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
