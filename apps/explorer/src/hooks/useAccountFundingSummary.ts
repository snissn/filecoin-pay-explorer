import { getAccountSummary } from "@filoz/synapse-core/pay";
import type { Synapse } from "@filoz/synapse-sdk";
import { useQuery } from "@tanstack/react-query";
import { type Address, createPublicClient, http } from "viem";
import { mainnet } from "@/constants/chains";
import type { Network } from "@/types";

const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });

export function useAccountFundingSummary(address: Address | undefined, network: Network, synapse: Synapse | null) {
  return useQuery({
    queryKey: ["account", address, "funding-summary", network],
    queryFn: async () => {
      if (synapse) return synapse.payments.accountSummary({});
      if (!address || network !== "mainnet") throw new Error("Filecoin mainnet account data is unavailable");
      return getAccountSummary(mainnetClient, { address });
    },
    enabled: !!address && (!!synapse || network === "mainnet"),
    refetchInterval: 30_000,
  });
}
