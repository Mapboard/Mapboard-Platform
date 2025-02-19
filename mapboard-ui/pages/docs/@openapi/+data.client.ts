import type { PageContextServer } from "vike/types";
import { apiBaseURL, apiDomain } from "~/settings";
import { render } from "vike/abort";

const openAPIMapping = {
  "pg-api": `${apiBaseURL}/`,
  api: `${apiDomain}/api/openapi.json`,
};

export const data = async (pageContext: PageContextServer) => {
  // https://vike.dev/useConfig
  const { openapi } = pageContext.routeParams;
  const url = openAPIMapping[openapi];
  if (url == null) {
    return render(404, "Not found");
  }

  const res = await fetch(url);
  return res.json();
};
