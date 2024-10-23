import SwaggerUI from "swagger-ui-react";
import h from "@macrostrat/hyper";
import "swagger-ui-react/swagger-ui.css";
import { useEffect, useState } from "react";

const apiDomain = import.meta.env.VITE_MAPBOARD_API_DOMAIN;
const basePath = "/pg-api";
const url = `${apiDomain}${basePath}/`;

export function Page() {
  const spec: any | null = useAPISpec(url);

  if (spec == null) return h("div", "Loading...");

  const newSpec = {
    ...spec,
    host: apiDomain.replace(/^https?:\/\//, ""),
    basePath,
    info: {
      ...spec.info,
      title: "Mapboard projects",
      description: "Manage Mapboard projects and users",
    },
  };

  return h(SwaggerUI, {
    spec: newSpec,
  });
}

function useAPISpec(url) {
  const [spec, setSpec] = useState(null);
  useEffect(() => {
    fetch(url)
      .then((res) => res.json())
      .then((data) => setSpec(data));
  }, [url]);
  return spec;
}
