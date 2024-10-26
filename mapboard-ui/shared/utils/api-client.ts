import { PostgrestClient } from "@supabase/postgrest-js";
import { apiBaseURL } from "../settings";
import { useEffect, useState } from "react";

export const postgrest = new PostgrestClient(apiBaseURL);

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
