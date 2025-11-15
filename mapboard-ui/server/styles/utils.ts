import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Assets and static files
// Serve FGDC assets
export const geologicPatternsBasePath = join(
  dirname(fileURLToPath(import.meta.resolve("geologic-patterns"))),
  "assets",
);

const geologicPatternsSVGPath = join(geologicPatternsBasePath, "svg");

export type RefineOptions = {
  color?: string;
  backgroundColor?: string;
  scale?: number;
};

export type SVGData = {
  svg: string;
  width: number;
  height: number;
  patternID?: string;
};

export interface PatternArgs extends RefineOptions {
  patternID: string;
  format: string;
}

export async function createPatternSVG(args: PatternArgs): Promise<SVGData> {
  const { color, backgroundColor, scale, format } = args;
  let { patternID } = args;

  const patternInt = parseInt(patternID, 10);
  if (!isNaN(patternInt) && patternInt < 600) {
    // We're working with a map pattern ID, which would have a suffix.
    // We assume -K
    patternID = `${patternInt}-K`;
  }

  const filePath = join(geologicPatternsSVGPath, `${patternID}.svg`);

  let svgContent: string | null = null;
  // Check if the file exists
  try {
    svgContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error("Pattern not found");
  }

  // Recolor the SVG if color is provided
  const recolorOptions = {
    color,
    backgroundColor,
    scale,
  };
  return { ...prepareSVG(svgContent, recolorOptions), patternID };
}

function prepareSVG(
  svgContent: string,
  options: RefineOptions,
): Omit<SVGData, "patternID"> {
  const { color, backgroundColor, scale } = options;

  // Use JSDOM to parse and manipulate the SVG content
  const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
  const { document } = dom.window;
  const svgElement = document.documentElement;

  if (color) {
    // Recolor the SVG if color is provided
    recolorSVG(document, color);
  }

  if (backgroundColor) {
    // Set the background color if provided
    svgElement.setAttribute("fill", backgroundColor);
    svgElement.setAttribute("style", `background-color: ${backgroundColor};`);
  }

  const size = rescaleSVG(document, scale ?? 1);

  // Serialize the modified SVG back to a string
  return {
    ...size,
    svg: dom.serialize(),
  };
}

function recolorSVG(document: Document, color: string) {
  // Find all elements that have fills or strokes
  const elements = document.querySelectorAll("[fill]");
  elements.forEach((el) => {
    el.setAttribute("fill", color);
  });
  const strokeElements = document.querySelectorAll("[stroke]");
  strokeElements.forEach((el) => {
    el.setAttribute("stroke", color);
  });

  // iterate through style attributes and replace colors
  const styleElements = document.querySelectorAll("[style]");
  for (const el of styleElements) {
    let style = el.getAttribute("style");
    if (!style) continue; // Skip if no style attribute

    // Find current fill colors if they exist
    const fillPattern = /fill:\s*([^;]+)/g;
    const fillMatch = fillPattern.exec(style);
    const currentFill = fillMatch?.[1];
    if (currentFill != null && currentFill != "none") {
      style = style.replace(fillPattern, `fill: ${color}`);
    }

    // Find current stroke colors if they exist
    const strokePattern = /stroke:\s*([^;]+)/g;
    const strokeMatch = strokePattern.exec(style);
    const currentStroke = strokeMatch?.[1];
    if (currentStroke != null && currentStroke != "none") {
      style = style.replace(strokePattern, `stroke: ${color}`);
    }
    el.setAttribute("style", style);
  }
}

interface Dimensions {
  width: number;
  height: number;
}

function rescaleSVG(
  document: Document,
  scale: number,
  makePixelPerfect: boolean = true,
): Dimensions {
  const svgElement = document.documentElement;

  // Set the width and height attributes based on the scale
  let width = svgElement.getAttribute("width");
  let height = svgElement.getAttribute("height");

  // If width or height is not set, we will use the viewBox to determine the dimensions
  if (!width || !height) {
    const viewBox = svgElement.getAttribute("viewBox");
    if (viewBox) {
      const [x, y, width, height] = viewBox.split(" ");
    }
  }

  // If there isn't a viewBox, set it based on the width and height so that the SVG scales correctly
  if (!svgElement.hasAttribute("viewBox") && width && height) {
    svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  if (!width || !height) {
    throw new Error("SVG does not have width or height defined.");
  }

  // Create the scaled size based on the provided scale

  let scaledSize = {
    width: Number(width) * scale,
    height: Number(height) * scale,
  };

  // If we want pixel-perfect scaling, we ensure the dimensions are integers
  if (makePixelPerfect) {
    scaledSize.width = Math.round(scaledSize.width);
    scaledSize.height = Math.round(scaledSize.height);
  }

  svgElement.setAttribute("width", String(scaledSize.width));
  svgElement.setAttribute("height", String(scaledSize.height));

  return scaledSize;
}

interface ImageConversionResult {
  buffer: Buffer;
  width: number;
  height: number;
}

export async function convertSVGToPNG(
  svgContent: string,
  options: RefineOptions,
): Promise<ImageConversionResult> {
  // Convert SVG to PNG
  const { createCanvas, loadImage } = await import("canvas");

  // Load the SVG content as an image
  const img = await loadImage(
    `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`,
  );
  // Adjust canvas size based on the SVG dimensions
  const width = img.width;
  const height = img.height;

  // We should maintain a pool of canvases to avoid creating a new one every time.
  const canvas = createCanvas(width, height); // Create a canvas with default size
  const ctx = canvas.getContext("2d");
  ctx.globalAlpha = 1;

  const { color, backgroundColor, scale = 1 } = options;

  // If background color is provided, fill the canvas with it

  ctx.drawImage(img, 0, 0, img.width, img.height);

  //ctx.fillStyle = imgColor;
  //ctx.fillRect(0, 0, 40, 40);

  // overlay using source-atop to follow transparency
  if (color != null) {
    // Fill the pixels already in the image with the specified color
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, img.width, img.height);
  }

  if (backgroundColor != null) {
    ctx.globalCompositeOperation = "destination-over";

    //const map = ctx.getImageData(0, 0, img.width, img.height);

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, img.width * scale, img.height * scale);
  }

  // Set the response headers for PNG
  return {
    buffer: canvas.toBuffer("image/png"),
    width,
    height,
  };
}
