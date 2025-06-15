/** An express service for generating colored pattern images for map units */

import { Router } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

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

  const filePath = join(geologicPatternsSVGPath, `${patternID}.svg`);

  // Load the SVG file as text
  try {
    const svgContent = await fs.readFile(filePath, "utf-8");
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svgContent);
  } catch (error) {
    console.error(`Error loading SVG for pattern ${patternID}:`, error);
    res.status(404).send("Pattern not found");
  }
});

export default app;
