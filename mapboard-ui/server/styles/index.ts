/** An express service for generating colored pattern images for map units */

import { Request, Router } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { convertSVGToPNG, refineSVG } from "./utils";

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

export default app;
