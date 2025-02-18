import SwaggerUI from "swagger-ui-react";
import h from "@macrostrat/hyper";
import "swagger-ui-react/swagger-ui.css";
import { apiDomain, apiBasePath as basePath } from "~/settings";
import { useData } from "vike-react/useData";

export function Page() {
  const spec = useData();

  const newSpec = {
    ...spec,
    host: apiDomain.replace(/^https?:\/\//, ""),
    basePath,
    info: {
      ...spec.info,
      // title: "Mapboard projects",
      // description: "Manage Mapboard projects and users",
    },
  };

  return h(SwaggerUI, {
    spec: newSpec,
  });
}
