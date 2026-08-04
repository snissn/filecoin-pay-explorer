import type { Synapse } from "@filoz/synapse-sdk";
import { useQuery } from "@tanstack/react-query";
import type { Network } from "@/types";

export function useAccountFundingSummary(accountId: string, network: Network, synapse: Synapse | null) {
  return useQuery({
    queryKey: ["account", accountId, "funding-summary", network],
    queryFn: async () => {
      if (!synapse) throw new Error("Synapse is not connected");
      return synapse.payments.accountSummary({});
    },
    enabled: !!accountId && !!synapse,
    refetchInterval: 30_000,
  });
}
