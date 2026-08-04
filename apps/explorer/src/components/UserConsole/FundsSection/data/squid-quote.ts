import {
  assertTrustedSquidQuote,
  quoteSquidRoute,
  type SourceToken,
  SQUID_ROUTER_ADDRESS,
  type SquidQuote,
} from "squid-evm-funding";
import type { Address } from "viem";

export const SQUID_SOURCE_CHAINS = [
  { id: 314, name: "Filecoin" },
  { id: 42161, name: "Arbitrum" },
  { id: 1, name: "Ethereum" },
  { id: 8453, name: "Base" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 43114, name: "Avalanche" },
  { id: 56, name: "BNB Chain" },
] as const;

export function quoteSquidTopUp({
  destinationAmount,
  destinationToken,
  integratorId,
  owner,
  source,
  sourceAmount,
}: {
  destinationAmount: bigint;
  destinationToken: Address;
  integratorId: string;
  owner: Address;
  source: SourceToken;
  sourceAmount: bigint;
}): Promise<SquidQuote> {
  if (!SQUID_SOURCE_CHAINS.some((chain) => chain.id === source.chainId)) {
    throw new Error("Select a supported source network");
  }
  if (integratorId.trim() === "") throw new Error("Squid quotes are unavailable");

  return quoteSquidRoute(
    {
      owner,
      source,
      sourceAmount,
      requirement: {
        amount: destinationAmount,
        chainId: 314,
        id: "filecoin-usdfc-top-up",
        recipient: owner,
        token: destinationToken,
      },
      slippage: 1,
    },
    { integratorId },
  ).then((quote) =>
    assertTrustedSquidQuote(quote, {
      spender: SQUID_ROUTER_ADDRESS,
      target: SQUID_ROUTER_ADDRESS,
    }),
  );
}
