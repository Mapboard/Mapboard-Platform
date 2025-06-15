/** An express service for generating colored pattern images for map units */

import { Router } from "express";
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

app.get("/pattern/:patternID.svg", async (req, res) => {
  const { patternID } = req.params;

  // Validate patternID to prevent directory traversal attacks
  if (!/^[a-zA-Z0-9_-]+$/.test(patternID)) {
    return res.status(400).send("Invalid pattern ID");
  }

  const filePath = join(geologicPatternsSVGPath, `${patternID}.svg`);

  let svgContent: string | null = null;
  // Check if the file exists
  try {
    svgContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error(`Pattern ${patternID} not found at path:`, filePath);
    return res.status(404).send("Pattern not found");
  }

  // Check if the request has query parameters for recoloring or rescaling
  const { color, scale } = req.query;
  const backgroundColor = req.query["background-color"];
  if (color) {
    // Recolor the SVG if color is provided
    const recolorOptions = {
      color: String(color),
      backgroundColor: backgroundColor ? String(backgroundColor) : undefined,
      scale: scale ? Number(scale) : undefined,
    };
    console.log(`Recoloring SVG with options:`, recolorOptions);
    svgContent = refineSVG(svgContent, recolorOptions);
  }

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svgContent);
});

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

export default app;
