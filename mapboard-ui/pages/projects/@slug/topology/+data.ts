import { postgrestForRequest } from "~/utils/api-client";
import { useConfig } from "vike-react/useConfig";
import type { PageContextServer } from "vike/types";
import { render } from "vike/abort";

export type Data = Awaited<ReturnType<typeof data>>;

export interface ContextOption {
  slug: string;
  name: string;
  canvas_id: number;
  is_main: boolean;
}

export const data = async (pageContext: PageContextServer) => {
  const config = useConfig();
  const { slug } = pageContext.routeParams;

  const res = await postgrestForRequest(pageContext)
    .from("context")
    .select("slug,name,canvas_id,is_main,project_name")
    .order("name", { ascending: true })
    .eq("project_slug", slug);

  const contexts = (res.data ?? []) as (ContextOption & {
    project_name: string;
  })[];
  if (contexts.length === 0) {
    throw render(404, "Project not found");
  }
  const title = contexts[0].project_name;
  config({ title: `Topology · ${title}` });

  return { title, contexts: contexts as ContextOption[] };
};
