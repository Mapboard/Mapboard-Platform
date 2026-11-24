import { PostgrestClient } from "@supabase/postgrest-js";
import { apiBaseURL } from "~/settings";
import { useEffect, useState } from "react";
import crossFetch from "cross-fetch";

export const postgrest = new PostgrestClient(apiBaseURL, {
  fetch: crossFetch,
});

type APIResultBuilder<T> = () => Promise<T>;
type PostgrestQueryFunction<T> = (pg: PostgrestClient) => Promise<T>;

export function useResult<T>(dataFetcher: APIResultBuilder<T>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    dataFetcher().then((data) => setData(data));
  }, deps);
  return data;
}

export function usePGResult<T>(
  fetcher: PostgrestQueryFunction<T>,
  deps: any[],
) {
  return useResult<T>(
    () =>
      fetcher(postgrest).then((val) => {
        return val.data;
      }),
    deps,
  );
}

function sessionToken(pageContext: any): string | null {
  const headers = pageContext?.headers ?? pageContext?.headersOriginal;
  const cookie: string | undefined = headers?.cookie ?? headers?.get?.("cookie");
  const match = cookie?.match(/(?:^|;\s*)access_token=("?)(Bearer [^";]+)\1/);
  return match?.[2] ?? null;
}

/** A PostgREST client acting as the visitor, for server-side data loaders:
 * the server's own requests carry no cookies, so private projects would be invisible. */
export function postgrestForRequest(pageContext: any): PostgrestClient {
  const token = sessionToken(pageContext);
  if (token == null) {
    return postgrest;
  }
  return new PostgrestClient(apiBaseURL, {
    fetch: crossFetch,
    headers: { Authorization: token },
  });
}
