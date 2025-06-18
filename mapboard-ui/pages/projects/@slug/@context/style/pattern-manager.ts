import { useMapStyleOperator, useMapRef } from "@macrostrat/mapbox-react"
import {useCallback} from "react";

export function MapPolygonPatternManager() {
  const mapRef = useMapRef()
  const styleImageMissing = useCallback((e) => {
    const map = mapRef.current;
    const { id } = e
    console.log(id, id.split(":"))
    const [prefix, name, color] = e.id.split(":");
    if (prefix != "fgdc" || name == null) {
      console.warn("styleimagemissing", e);
      return;
    }

    const _color = color.replace(/#/g, '%23')

    const url = `/styles/pattern/${name}.png?scale=4&color=${_color}`;

    map.loadImage(url, (error, image) => {
      if (error) {
        console.error("Error loading image:", error);
        return;
      }
      if (!map.hasImage(id)) {
        map.addImage(id, image, {
          pixelRatio: 2, // Use a higher pixel ratio for better quality
        });
      }
    });

  }, []);

  useMapStyleOperator((map) => {
    map.on("styleimagemissing", styleImageMissing);
    return () => {
      map.off("styleimagemissing", styleImageMissing);
    };
  }, [styleImageMissing]);

  return null;
}

