import { postgrest } from "~/utils/api-client";
import type { PageContextServer } from "vike/types";
import type { definitions } from "~/types/project-api";

export type DataClient = Awaited<ReturnType<typeof data>>;

export const data = async (pageContext: PageContextServer) => {
  const response = await postgrest
    .from("project")
    .select()
    .order("id", { ascending: false })
    .throwOnError();

  return (response.data as definitions["projects"][]) ?? [];
};
