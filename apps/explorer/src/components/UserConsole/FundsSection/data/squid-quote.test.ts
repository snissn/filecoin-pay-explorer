import { describe, expect, it, vi } from "vitest";
import { planSquidTopUp, SQUID_SOURCE_CHAINS } from "./squid-quote";

const planSquidFunding = vi.hoisted(() => vi.fn());
const assertTrustedSquidQuote = vi.hoisted(() => vi.fn((quote) => quote));

vi.mock("squid-evm-funding", () => ({
  assertTrustedSquidQuote,
  planSquidFunding,
  SQUID_ROUTER_ADDRESS: "0xce16f69375520ab01377ce7b88f5ba8c48f8d666",
}));

const owner = "0x1111111111111111111111111111111111111111" as const;
const usdfc = "0x2222222222222222222222222222222222222222" as const;

describe("Squid quote review", () => {
  it("plans an explicit Filecoin source cap and accepts only a trusted current route", async () => {
    const quote = {
      actions: [{ fromChainId: 314, toChainId: 314, type: "swap" }],
      approvalSpender: "0xce16f69375520ab01377ce7b88f5ba8c48f8d666",
      costs: [],
      destinationAmount: 1_000_000_000_000_000_000n,
      expiresAt: 1_001,
      id: "quote",
      requirement: { amount: 1_000_000_000_000_000_000n, chainId: 314, id: "top-up", recipient: owner, token: usdfc },
      sourceAmount: 2_000_000_000_000_000_000n,
      target: "0xce16f69375520ab01377ce7b88f5ba8c48f8d666",
      value: 0n,
      data: "0x12",
    };
    planSquidFunding.mockResolvedValue({
      maxSourceAmount: 2_000_000_000_000_000_000n,
      owner,
      quotes: [quote],
      slippage: 1,
      source: { chainId: 314, decimals: 18, symbol: "FIL", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
    });

    await expect(
      planSquidTopUp({
        destinationAmount: 1_000_000_000_000_000_000n,
        destinationToken: usdfc,
        integratorId: "test",
        owner,
        source: {
          chainId: 314,
          decimals: 18,
          symbol: "FIL",
          token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        },
        sourceAmount: 2_000_000_000_000_000_000n,
      }),
    ).resolves.toMatchObject({ quotes: [{ id: "quote" }] });
    expect(planSquidFunding).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSourceAmount: "2",
        sourceChainId: 314,
        sourceToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      }),
      { integratorId: "test" },
    );
    expect(assertTrustedSquidQuote).toHaveBeenCalledWith(expect.any(Object), {
      spender: "0xce16f69375520ab01377ce7b88f5ba8c48f8d666",
      target: "0xce16f69375520ab01377ce7b88f5ba8c48f8d666",
    });
    expect(SQUID_SOURCE_CHAINS.map((chain) => chain.id)).toEqual([314, 42161, 1, 8453, 10, 137, 43114, 56]);
  });

  it("rejects a source outside the selected networks before requesting a route", async () => {
    await expect(
      planSquidTopUp({
        destinationAmount: 1n,
        destinationToken: usdfc,
        integratorId: "test",
        owner,
        source: { chainId: 5, decimals: 18, symbol: "ETH", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
        sourceAmount: 1n,
      }),
    ).rejects.toThrow("Select a supported source network");
  });
});
