import h from "@macrostrat/hyper";
import { useParams } from "~/utils/routing";
import { TopologyView } from "../topology-view";

export function Page() {
  const { slug, run } = useParams();
  return h(TopologyView, { project: slug, runId: run });
}
