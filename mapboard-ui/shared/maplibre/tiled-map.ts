import maplibre from "maplibre-gl";
import { SphericalMercator } from "@mapbox/sphericalmercator";
import { setupStyleImageManager } from "../../pages/projects/@slug/@context/style/pattern-manager";
import type { CrossSectionData } from "../../pages/projects/@slug/@context/print/cross-sections/+data";

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

function lngLatBounds(bounds: MercatorBBox): maplibre.LngLatBoundsLike {
  const sw = mercator.inverse([bounds[0], bounds[1]]);
  const ne = mercator.inverse([bounds[2], bounds[3]]);
  return [sw, ne];
}

interface TileBoundsResult {
  tiles: MapTile[];
  pixelSize: {
    width: number;
    height: number;
  };
  bounds: MercatorBBox;
  metersPerPixel: number;
}

interface TileComputationOptions {
  metersPerPixel?: number;
  tileSize?: number;
}

export type MercatorBBox = [number, number, number, number];

interface MapTile {
  bounds: MercatorBBox;
  pixelSize: {
    width: number;
    height: number;
  };
  pixelOffset: {
    top: number;
    left: number;
  };
}

export async function renderTiledMap(
  element: HTMLDivElement,
  config: TileBoundsResult,
  style: any,
) {
  const { tiles, bounds } = config;

  const container = document.createElement("div");
  container.className = "map-container";
  element.appendChild(container);

  const map = new maplibre.Map({
    container,
    bounds: lngLatBounds(bounds),
    style,
    trackResize: false,
    attributionControl: false,
    interactive: false,
    maxZoom: 22,
    pixelRatio: 4,
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false,
    boxZoom: false,
  });
  setupStyleImageManager(map);

  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";
  element.appendChild(imageContainer);

  imageContainer.style.position = "relative";
  imageContainer.style.width = config.pixelSize.width + "px";
  imageContainer.style.height = config.pixelSize.height + "px";

  for await (const tile of tiles) {
    const { bounds, pixelSize } = tile;
    container.style.position = "absolute";
    setSize(container, tile);
    map.resize();
    map.fitBounds(lngLatBounds(bounds), { duration: 0, padding: 0 });
    await new Promise((resolve) => {
      map.once("idle", () => {
        resolve(null);
      });
    });
    const img = new Image();
    imageContainer.appendChild(img);
    setSize(img, tile);
    const dataUrl = map.getCanvas().toDataURL("image/png");
    img.src = dataUrl;

    await new Promise((resolve) => {
      img.onload = () => resolve(null);
    });
  }

  // Clean up
  map.remove();
  container.remove();
}

function setSize(element: HTMLDivElement, config: MapTile) {
  const { pixelSize } = config;
  element.style.width = pixelSize.width + "px";
  element.style.height = pixelSize.height + "px";
  element.style.position = "absolute";
  element.style.top = config.pixelOffset.top + "px";
  element.style.left = config.pixelOffset.left + "px";
}

export function computeTiledBounds(
  bounds: MercatorBBox,
  options: TileComputationOptions = {},
): TileBoundsResult {
  const [minX, minY, maxX, maxY] = bounds;
  const ll: [number, number] = [minX, minY];
  const ur: [number, number] = [maxX, maxY];

  const { metersPerPixel = 10, tileSize = 1024 } = options;
  const width = ur[0] - ll[0];
  const height = ur[1] - ll[1];

  const pixelWidth = width / metersPerPixel;
  const pixelHeight = height / metersPerPixel;

  const tilesX = Math.ceil(pixelWidth / tileSize);
  const tilesY = Math.ceil(pixelHeight / tileSize);

  // Iterate over tiles in x and y directions
  let sx = 0;
  let sy = 0;
  const tiles: MapTile[] = [];
  for (let x = 0; x < tilesX; x++) {
    sy = 0;
    const tileWidth = sx + tileSize > pixelWidth ? pixelWidth - sx : tileSize;
    for (let y = 0; y < tilesY; y++) {
      const tileHeight =
        sy + tileSize > pixelHeight ? pixelHeight - sy : tileSize;

      const minX = ll[0] + sx * metersPerPixel;
      const minY = ll[1] + sy * metersPerPixel;
      const maxX = minX + tileWidth * metersPerPixel;
      const maxY = minY + tileHeight * metersPerPixel;

      tiles.push({
        bounds: [minX, minY, maxX, maxY],
        pixelSize: {
          width: tileWidth,
          height: tileHeight,
        },
        pixelOffset: {
          left: sx,
          top: sy,
        },
      });

      sy += tileSize;
    }
    sx += tileSize;
  }

  return {
    tiles,
    pixelSize: {
      width: pixelWidth,
      height: pixelHeight,
    },
    bounds,
    metersPerPixel,
  };
}
