/** An express service for generating colored pattern images for map units */

import { Request, Response, Router } from "express";

import { createPatternSVG, convertSVGToPNG } from "./utils";
import { postgrest } from "~/utils/api-client";
import { buildSpriteSheet, SpritesResult } from "./sprite-generator";

// Create a set of express routes

const app = Router();

app.get("/sprite/:projectSlug/:contextSlug.:format", async (req, res) => {
  const { projectSlug, format } = req.params;
  let { contextSlug } = req.params;
  const validFormats = ["png", "json"];
  if (!validFormats.includes(format)) {
    return res
      .status(400)
      .send("Invalid format. Only 'png' and 'json' are supported.");
  }

  let scale = 1;
  if (contextSlug.endsWith("@2x")) {
    // Remove the @2x suffix for processing
    contextSlug = contextSlug.slice(0, -3);
    scale *= 2; // Set scale to 2 for @2x contexts
  }
  try {
    let spriteData = await buildSpriteSheet({
      projectSlug,
      contextSlug,
      scale,
    });

    // Respond with the sprite sheet in the requested format
    if (format === "png") {
      res.setHeader("Content-Type", "image/png");
      res.send(spriteData.image);
    } else if (format === "json") {
      res.json(spriteData.data);
    }
  } catch (error) {
    return res
      .status(500)
      .send(`Error generating sprite sheet: ${error.message}`);
  }
});

app.get("/pattern/:patternID.:format", async (req, res) => {
  let { patternID, format } = req.params;
  // Check if the request has query parameters for recoloring or rescaling
  const backgroundColor = parseQueryParam(req, "background-color", String);
  const color = parseQueryParam(req, "color", String);
  const scale = parseQueryParam(req, "scale", Number);

  return sendPatternResponse(res, {
    patternID,
    format,
    color,
    backgroundColor,
    scale,
  });
});

app.get(
  "/project/:projectSlug/:contextSlug/pattern/:unitID.:format",
  async (req, res) => {
    // Get information from the API
    const { projectSlug, contextSlug, unitID, format } = req.params;

    const meta = await postgrest
      .from("polygon_type")
      .select("color,symbol,symbol_color")
      .eq("id", unitID)
      .eq("project_slug", projectSlug)
      .eq("context_slug", contextSlug);
    if (meta.error) {
      return res.status(meta.status).send(meta.error);
    }
    const data = meta.data[0];
    if (!data) {
      return res.status(404).send("Pattern not found");
    }
    const { color, symbol, symbol_color } = data;

    return sendPatternResponse(res, {
      patternID: symbol,
      format,
      color: symbol_color,
      backgroundColor: color,
      scale: parseQueryParam(req, "scale", Number),
    });
  },
);

async function sendPatternResponse(res: Response<any, any>, args: PatternArgs) {
  const { format, backgroundColor } = args;
  let { patternID } = args;
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

  const svgResult = await createPatternSVG(args);

  if (format === "png") {
    // Convert SVG to PNG
    const result = await convertSVGToPNG(svgResult.svg, backgroundColor);
    res.setHeader("Content-Type", "image/png");
    res.send(result.buffer);
  } else {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svgResult.svg);
  }
}

function parseQueryParam(
  req: Request,
  key: string,
  castType: typeof Number | typeof String,
): any {
  const value = req.query[key];
  return value ? castType(value) : undefined;
}

export default app;
