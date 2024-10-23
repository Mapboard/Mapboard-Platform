import h from "@macrostrat/hyper";
import { useParams } from "~/utils/routing";

export function Page() {
  const { slug } = useParams();

  return h("div.page", [h("h1", ["Project ", h("code", slug)])]);
}
