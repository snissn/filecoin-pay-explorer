import { useQuery } from "@tanstack/react-query";
import { createBossGraphQLClient } from "@/services/boss/client";
import type { Network } from "@/types";
import useNetwork from "./useNetwork";

export interface UseBossGraphQLQueryOptions<TData, TResult = TData> {
  networkOverride?: Network;
  queryKey: readonly unknown[];
  query: (client: ReturnType<typeof createBossGraphQLClient>) => Promise<TData>;
  select?: (data: TData) => TResult;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useBossGraphQLQuery<TData, TResult = TData>(options: UseBossGraphQLQueryOptions<TData, TResult>) {
  const { network: contextNetwork } = useNetwork();
  const network = options.networkOverride ?? contextNetwork;
  return useQuery({
    queryKey: ["boss", ...options.queryKey, network] as const,
    queryFn: () => options.query(createBossGraphQLClient(network)),
    select: options.select,
    enabled: options.enabled,
    refetchInterval: options.refetchInterval,
  });
}
