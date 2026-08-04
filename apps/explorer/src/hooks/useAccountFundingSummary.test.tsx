// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountFundingSummary } from "./useAccountFundingSummary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getAccountSummary = vi.hoisted(() => vi.fn());

vi.mock("@filoz/synapse-core/pay", () => ({ getAccountSummary }));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({}),
  http: () => ({}),
}));

function Summary({ address }: { address: `0x${string}` }) {
  const { data } = useAccountFundingSummary(address, "mainnet", null);
  return <p>{data ? "Funding summary loaded" : "Loading"}</p>;
}

describe("useAccountFundingSummary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    getAccountSummary.mockResolvedValue({ availableFunds: 1n, debt: 0n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("loads Filecoin mainnet funding data for a fresh external-wallet top-up session", async () => {
    const address = "0x1111111111111111111111111111111111111111" as const;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Summary address={address} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain("Funding summary loaded"));
    });

    expect(getAccountSummary).toHaveBeenCalledWith(expect.anything(), { address });
  });
});
