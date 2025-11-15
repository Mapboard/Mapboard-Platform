/** An express service for generating colored pattern images for map units */

import { Request, Response, Router } from "express";

import { createPatternSVG, convertSVGToPNG, PatternArgss } from "./utils";

// Create a set of express routes

const app = Router();

app.get("/", (req: Request, res: Response) => {
  res.send("Pattern service is running");
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

async function sendPatternResponse(res: Response<any, any>, args: PatternArgs) {
  const { format, color, backgroundColor, scale } = args;
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

  if (format === "png") {
    // Convert SVG to PNG
    const svgResult = await createPatternSVG({ patternID, scale, format });
    const result = await convertSVGToPNG(svgResult.svg, {
      color,
      backgroundColor,
    });
    res.setHeader("Content-Type", "image/png");
    res.send(result.buffer);
  } else {
    const svgResult = await createPatternSVG(args);
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
