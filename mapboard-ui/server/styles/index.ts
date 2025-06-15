/** An express service for generating colored pattern images for map units */

import { Router, Request } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

import { JSDOM } from "jsdom";

// Create a set of express routes

const app = Router();

// Assets and static files
// Serve FGDC assets
export const geologicPatternsBasePath = join(
  dirname(fileURLToPath(import.meta.resolve("geologic-patterns"))),
  "assets",
);

const geologicPatternsSVGPath = join(geologicPatternsBasePath, "svg");

app.get("/pattern/:patternID.:format", async (req, res) => {
  let { patternID, format } = req.params;

  // Only allow 'svg' and 'png' formats
  if (format != "svg" && format != "png") {
    return res
      .status(400)
      .send("Invalid format. Only 'svg' and 'png' are supported.");
  }

  // Validate patternID to prevent directory traversal attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(patternID)) {
    return res.status(400).send("Invalid pattern ID");
  }

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
    return res.status(404).send("Pattern not found");
  }

  // Check if the request has query parameters for recoloring or rescaling
  const backgroundColor = parseQueryParam(req, "background-color", String);
  const color = parseQueryParam(req, "color", String);
  const scale = parseQueryParam(req, "scale", Number);

  if (color || backgroundColor || scale) {
    // Recolor the SVG if color is provided
    const recolorOptions = {
      color,
      backgroundColor,
      scale,
    };
    svgContent = refineSVG(svgContent, recolorOptions);
  }

  if (format === "png") {
    // Convert SVG to PNG
    const pngBuffer = await convertSVGToPNG(svgContent, backgroundColor);
    res.setHeader("Content-Type", "image/png");
    res.send(pngBuffer);
  } else {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svgContent);
  }
});

function parseQueryParam(
  req: Request,
  key: string,
  castType: typeof Number | typeof String,
): any {
  const value = req.query[key];
  return value ? castType(value) : undefined;
}

type RefineOptions = {
  color?: string;
  backgroundColor?: string;
  scale?: number;
};

function refineSVG(svgContent: string, options: RefineOptions): string {
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

  if (scale) {
    // Rescale the SVG if scale is provided
    rescaleSVG(document, scale);
  }

  // Serialize the modified SVG back to a string
  return dom.serialize();
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

function rescaleSVG(document: Document, scale: number) {
  const svgElement = document.documentElement;

  // Set the width and height attributes based on the scale
  const width = svgElement.getAttribute("width");
  const height = svgElement.getAttribute("height");
  console.log(width, height, svgElement);
  if (width && height) {
    svgElement.setAttribute("width", String(Number(width) * scale));
    svgElement.setAttribute("height", String(Number(height) * scale));
  }
}

async function convertSVGToPNG(
  svgContent: string,
  backgroundColor: string | null | undefined,
): Promise<Buffer> {
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

  // If background color is provided, fill the canvas with it
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Draw the image onto the canvas
  ctx.drawImage(img, 0, 0);

  // Set the response headers for PNG
  return canvas.toBuffer("image/png");
}

export default app;
