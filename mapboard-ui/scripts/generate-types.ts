import dotenv from "dotenv";
import openapiTypescript from "openapi-typescript";
import fs from "fs";

dotenv.config();

const apiDomain = process.env.VITE_MAPBOARD_API_DOMAIN;

const schemaAddress = `${apiDomain}/pg-api/`;

const outDir = "./shared/types/";

// make directory
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

console.log(`Generating types for API at ${schemaAddress}`);

openapiTypescript(schemaAddress, {
  exportName: "ApiTypes",
}).then((result) => {
  console.log("Types generated successfully");
  // write the types to a file
  fs.writeFileSync(`${outDir}/project-api.ts`, result);
});
