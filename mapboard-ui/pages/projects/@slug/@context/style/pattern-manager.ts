import { useMapStyleOperator, useMapRef } from "@macrostrat/mapbox-react";
import { useCallback } from "react";
import { createSolidColorImage, loadImage } from "./pattern-images";

export function MapPolygonPatternManager() {
  const mapRef = useMapRef();
  const styleImageMissing = useCallback((e) => {
    const map = mapRef.current;
    const { id } = e;

    buildPatternImage(e.id).then((image) => {
      if (!map.hasImage(id) && image != null) {
        map.addImage(id, image, {
          pixelRatio: 2, // Use a higher pixel ratio for better quality
        });
      }
    });

    // const [name, color, backgroundColor] = rest;
    //
    // const urlParams = new URLSearchParams();
    // urlParams.set("scale", "4");
    // if (backgroundColor) {
    //   urlParams.set("background-color", backgroundColor);
    // }
    // if (color) {
    //   urlParams.set("color", color);
    // }
    //
    // const url = `/styles/pattern/${name}.png?${urlParams.toString()}`;
    //
    // map.loadImage(url, (error, image) => {
    //   if (error) {
    //     console.error("Error loading image:", error);
    //     return;
    //   }
    //   if (!map.hasImage(id)) {
    //     map.addImage(id, image, {
    //       pixelRatio: 2, // Use a higher pixel ratio for better quality
    //     });
    //   }
    // });
  }, []);

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

  useMapStyleOperator(
    (map) => {
      map.on("styleimagemissing", styleImageMissing);
      return () => {
        map.off("styleimagemissing", styleImageMissing);
      };
    },
    [styleImageMissing],
  );

  return null;
}
