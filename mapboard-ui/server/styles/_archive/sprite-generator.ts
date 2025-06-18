/** Create spritesheets from patterns for a given project and context. *./
 */

import { postgrest } from "~/utils/api-client";
import genericPool from "generic-pool";
import { createPatternSVG, SVGData } from "./utils";
import layout from "sprite-flex-layout";
import { loadImage } from "canvas";
import md5 from "md5";
const { Node } = layout;

interface ProjectArgs {
  projectSlug: string;
  contextSlug: string;
  scale?: number; // Optional scale factor, default is 1
}

const canvasPool = genericPool.createPool(
  {
    create: async () => {
      const { createCanvas } = await import("canvas");
      return createCanvas(100, 100); // Create a canvas with default size
    },
    destroy: async (canvas) => {
      // No specific cleanup needed for canvas
    },
  },
  {
    max: 10, // Maximum number of canvases in the pool
    min: 2, // Minimum number of canvases in the pool
  },
);

interface SpriteData extends SVGData {
  unitID: string;
  backgroundColor?: string; // Optional background color for the sprite
}

const spriteSheetCache = new Map<string, SpritesResult>();

export async function buildSpriteSheet(args: ProjectArgs) {
  const { projectSlug, contextSlug, scale } = args;

  const { error, data } = await postgrest
    .from("polygon_type")
    .select("id,symbol,symbol_color,color")
    .eq("project_slug", projectSlug)
    .eq("context_slug", contextSlug)
    .filter("symbol", "not.is", null);
  if (error) {
    throw new Error(error.message);
  }

  const keyData = { projectSlug, contextSlug, scale, data };
  // Get a hash of the keyData object to use as a cache key
  const cacheKey = md5(JSON.stringify(keyData));

  // Check if we have a cached sprite sheet
  let cachedSpriteSheet = spriteSheetCache.get(cacheKey);
  if (cachedSpriteSheet != null) {
    // If we have a cached sprite sheet, return it
    return cachedSpriteSheet;
  }
  // If not cached, we will generate the sprite sheet

  // Get svg images for each pattern
  const patterns: SpriteData[] = await Promise.all(
    data.map(async (item) => {
      const { id, symbol, symbol_color, color } = item;
      const res = await createPatternSVG({
        patternID: symbol,
        format: "svg",
        color: symbol_color,
        backgroundColor: color,
        scale, // Default scale
      });
      return {
        ...res,
        backgroundColor: color,
        unitID: id,
      };
    }),
  );

  const res = await generateSprites(patterns);
  // Store the generated sprite sheet in the cache
  spriteSheetCache.set(cacheKey, res);
  return res;
}

async function generateSprites(patterns: Array<SpriteData>): SpritesResult {
  // Implement a layout algorithm to arrange the sprites in a grid or other layout

  const maxAxisSize = patterns.reduce(
    (max, pattern) => max + Math.ceil(Math.max(pattern.width, pattern.height)),
    0,
  );

  const targetWidth = Math.ceil(maxAxisSize / Math.ceil(patterns.length / 4));

  const container = new Node({
    width: targetWidth,
    flexFlow: "row wrap",
  });

  const patternsWithNodes = patterns.map((pattern, index) => {
    const node = new Node({
      width: pattern.width,
      height: pattern.height,
    });
    container.appendChild(node);
    return {
      ...pattern,
      node,
    };
  });

  container.calculateLayout();

  const spriteWidth = Math.max(
    ...patternsWithNodes.map((res) => res.node.width + res.node.left),
  );
  const spriteHeight = Math.max(
    ...patternsWithNodes.map((res) => res.node.height + res.node.top),
  );

  // Build the sprite sheet using the canvas
  const canvas = await canvasPool.acquire();
  canvas.width = spriteWidth;
  canvas.height = spriteHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  ctx.clearRect(0, 0, spriteWidth, spriteHeight);

  for (const res of patternsWithNodes) {
    const { node, svg, backgroundColor } = res;

    // Load the SVG content as an image
    const b64str = Buffer.from(svg).toString("base64");
    const img = await loadImage(`data:image/svg+xml;base64,${b64str}`);
    img.width = node.width;
    img.height = node.height;
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(node.left, node.top, node.width, node.height);
    }

    ctx.drawImage(img, node.left, node.top, node.width, node.height);
  }
  // Get the canvas as a buffer
  const buffer = canvas.toBuffer("image/png");
  // Release the canvas back to the pool
  await canvasPool.release(canvas);

  // SpriteJSON structure
  let sprites: Record<string, any> = {};
  for (const res of patternsWithNodes) {
    const { node, unitID } = res;
    sprites[unitID] = {
      x: node.left,
      y: node.top,
      width: node.width,
      height: node.height,
    };
  }

  return {
    data: sprites,
    image: buffer, // Placeholder for the image buffer
  };
}

function acquireImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  // Create a new image element and set its source

  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
}

interface SpriteJSON {
  [key: string]: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SpritesResult {
  data: SpriteJSON;
  image: Buffer;
}
