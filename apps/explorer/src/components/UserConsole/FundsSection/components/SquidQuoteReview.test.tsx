// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SquidQuoteReview } from "./SquidQuoteReview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quoteSquidTopUp = vi.hoisted(() => vi.fn());
const wallet = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111", chainId: 314 }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [{ chainId: 314, decimals: 18, symbol: "FIL", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }],
    isFetching: false,
  }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: "0x2222222222222222222222222222222222222222" } } }),
}));
vi.mock("wagmi", () => ({ useAccount: () => wallet }));
vi.mock("../data/squid-quote", () => ({
  quoteSquidTopUp,
  SQUID_SOURCE_CHAINS: [{ id: 314, name: "Filecoin" }],
}));
vi.mock("squid-evm-funding", () => ({ fetchSourceTokens: vi.fn() }));

describe("SquidQuoteReview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = "0x1111111111111111111111111111111111111111";
    wallet.chainId = 314;
    quoteSquidTopUp.mockResolvedValue({
      actions: [{ description: "Bridge tokens", type: "bridge" }],
      costs: [{ amount: 1n, token: { decimals: 18, symbol: "FIL" } }],
      destinationAmount: 1_000_000_000_000_000_000n,
      expiresAt: 2_000_000_000,
      sourceAmount: 2_000_000_000_000_000_000n,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Missing value setter");
    setter.call(element, value);
  };

  const selectQuoteInput = async () => {
    const selects = container.querySelectorAll("select");
    const input = container.querySelector("input");
    if (
      !(selects[0] instanceof HTMLSelectElement) ||
      !(selects[1] instanceof HTMLSelectElement) ||
      !(input instanceof HTMLInputElement)
    ) {
      throw new Error("Missing quote controls");
    }
    await act(async () => {
      setValue(selects[0], "314");
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      setValue(selects[1], "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      setValue(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders a trusted read-only route with its material amounts, fee, route, and expiry", async () => {
    await act(async () =>
      root.render(<SquidQuoteReview destinationAmount={1_000_000_000_000_000_000n} network='mainnet' />),
    );
    await selectQuoteInput();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Review route",
    );
    if (!button) throw new Error("Missing review button");
    await act(async () => button.click());

    expect(quoteSquidTopUp).toHaveBeenCalledWith(expect.objectContaining({ sourceAmount: 2_000_000_000_000_000_000n }));
    expect(container.textContent).toContain("Spend: 2 FIL");
    expect(container.textContent).toContain("Receive at least: 1 USDFC");
    expect(container.textContent).toContain("Fees: 0.000000000000000001 FIL");
    expect(container.textContent).toContain("Bridge tokens");
    expect(container.textContent).toContain("Expires:");
    expect(container.textContent).toContain("this does not request a wallet signature");
  });

  it("fails closed when the wallet changes while a quote is loading", async () => {
    let resolveQuote: (quote: Awaited<ReturnType<typeof quoteSquidTopUp>>) => void;
    quoteSquidTopUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        }),
    );
    await act(async () =>
      root.render(<SquidQuoteReview destinationAmount={1_000_000_000_000_000_000n} network='mainnet' />),
    );
    await selectQuoteInput();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Review route",
    );
    if (!button) throw new Error("Missing review button");
    await act(async () => button.click());
    wallet.address = "0x3333333333333333333333333333333333333333";
    await act(async () =>
      root.render(<SquidQuoteReview destinationAmount={1_000_000_000_000_000_000n} network='mainnet' />),
    );
    await act(async () =>
      resolveQuote?.({ actions: [], costs: [], destinationAmount: 1n, expiresAt: 2_000_000_000, sourceAmount: 1n }),
    );

    expect(container.textContent).toContain("Funding details or wallet changed while requesting the quote.");
    expect(container.textContent).not.toContain("Spend:");
  });
});
