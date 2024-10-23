import { usePageContext } from "vike-react/usePageContext";

export function useParams() {
  return usePageContext().routeParams;
}
