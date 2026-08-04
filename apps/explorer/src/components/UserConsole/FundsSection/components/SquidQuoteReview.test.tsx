// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SquidQuoteReview } from "./SquidQuoteReview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const planSquidTopUp = vi.hoisted(() => vi.fn());
const executeSquidTopUp = vi.hoisted(() => vi.fn());
const sourceTokens = vi.hoisted(() => [
  { chainId: 314, decimals: 18, symbol: "FIL", token: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" },
]);
const wallet = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111", chainId: 314 }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: sourceTokens,
    isFetching: false,
  }),
}));
vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ constants: { contracts: { usdfc: "0x2222222222222222222222222222222222222222" } } }),
}));
vi.mock("wagmi", () => ({
  useAccount: () => wallet,
  usePublicClient: () => ({}),
  useWalletClient: () => ({ data: { account: wallet } }),
}));
vi.mock("../data/squid-quote", () => ({
  planSquidTopUp,
}));
vi.mock("../data/squid-execution", () => ({ executeSquidTopUp }));
vi.mock("squid-evm-funding", () => ({ fetchSourceTokens: vi.fn() }));

describe("SquidQuoteReview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    wallet.address = "0x1111111111111111111111111111111111111111";
    wallet.chainId = 314;
    planSquidTopUp.mockResolvedValue({
      maxSourceAmount: 2_000_000_000_000_000_000n,
      owner: wallet.address,
      quotes: [
        {
          actions: [{ description: "Bridge tokens", type: "bridge" }],
          costs: [{ amount: 1n, token: { decimals: 18, symbol: "FIL" } }],
          destinationAmount: 1_000_000_000_000_000_000n,
          expiresAt: 2_000_000_000,
          sourceAmount: 2_000_000_000_000_000_000n,
        },
      ],
      slippage: 1,
      source: sourceTokens[0],
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

  const QuoteHarness = ({ onAcquired = vi.fn() }: { onAcquired?: (amount: bigint) => void }) => {
    const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
    return (
      <SquidQuoteReview
        acquisitionState={acquisitionState}
        destinationAmount={1_000_000_000_000_000_000n}
        network='mainnet'
        onAcquired={onAcquired}
        onAcquisitionStateChange={setAcquisitionState}
      />
    );
  };

  const selectQuoteInput = async (token = sourceTokens[0]?.token) => {
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
      if (!token) throw new Error("Missing source token");
      setValue(selects[1], token);
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      setValue(input, "2");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const button = (label: string) => {
    const match = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  };

  const setInputValue = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      setValue(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders a trusted read-only route with its material amounts, fee, route, and expiry", async () => {
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Review route",
    );
    if (!button) throw new Error("Missing review button");
    await act(async () => button.click());

    expect(planSquidTopUp).toHaveBeenCalledWith(expect.objectContaining({ sourceAmount: 2_000_000_000_000_000_000n }));
    expect(container.textContent).toContain("Spend: 2 FIL");
    expect(container.textContent).toContain("Receive at least: 1 USDFC");
    expect(container.textContent).toContain("Fees: 0.000000000000000001 FIL");
    expect(container.textContent).toContain("Bridge tokens");
    expect(container.textContent).toContain("Expires:");
    expect(container.textContent).toContain("this does not request a wallet signature");
  });

  it("fails closed when the wallet changes while a quote is loading", async () => {
    let resolvePlan: (plan: Awaited<ReturnType<typeof planSquidTopUp>>) => void;
    planSquidTopUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlan = resolve;
        }),
    );
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Review route",
    );
    if (!button) throw new Error("Missing review button");
    await act(async () => button.click());
    wallet.address = "0x3333333333333333333333333333333333333333";
    await act(async () => root.render(<QuoteHarness />));
    await act(async () =>
      resolvePlan?.({ maxSourceAmount: 1n, owner: wallet.address, quotes: [], slippage: 1, source: sourceTokens[0] }),
    );

    expect(container.textContent).toContain("Funding details or wallet changed while requesting the quote.");
    expect(container.textContent).not.toContain("Spend:");
    expect(executeSquidTopUp).not.toHaveBeenCalled();
  });

  it("does not execute when the connected wallet is on a different source network", async () => {
    wallet.chainId = 1;
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    await act(async () => button("Review route").click());
    const maximumFee = container.querySelectorAll("input")[1];
    if (!(maximumFee instanceof HTMLInputElement)) throw new Error("Missing maximum fee input");
    await setInputValue(maximumFee, "0.01");
    await act(async () => button("Acquire USDFC").click());

    expect(container.textContent).toContain("Switch your wallet to the selected source network before confirming.");
    expect(executeSquidTopUp).not.toHaveBeenCalled();
  });

  it("executes the reviewed plan only after an explicit fee-capped confirmation", async () => {
    executeSquidTopUp.mockResolvedValue({ nativeFee: 1n, routes: [], sourceAmount: 2n });
    const reviewedPlan = {
      maxSourceAmount: 2_000_000_000_000_000_000n,
      owner: wallet.address,
      quotes: [
        {
          actions: [],
          costs: [],
          destinationAmount: 1_000_000_000_000_000_000n,
          expiresAt: 2_000_000_000,
          sourceAmount: 2_000_000_000_000_000_000n,
        },
      ],
      slippage: 1,
      source: sourceTokens[0],
    };
    planSquidTopUp.mockResolvedValueOnce(reviewedPlan);
    const onAcquired = vi.fn();
    await act(async () => root.render(<QuoteHarness onAcquired={onAcquired} />));
    await selectQuoteInput();
    await act(async () => button("Review route").click());
    const inputs = container.querySelectorAll("input");
    const maximumFee = inputs[1];
    if (!(maximumFee instanceof HTMLInputElement)) throw new Error("Missing maximum fee input");
    await setInputValue(maximumFee, "0.01");
    await act(async () => button("Acquire USDFC").click());

    expect(executeSquidTopUp).toHaveBeenCalledWith(
      expect.objectContaining({
        maxNativeFee: 10_000_000_000_000_000n,
        plan: reviewedPlan,
      }),
    );
    expect(onAcquired).toHaveBeenCalledWith(1_000_000_000_000_000_000n);
  });

  it("blocks another acquisition in the dialog after an ambiguous execution failure", async () => {
    executeSquidTopUp.mockRejectedValue(new Error("Connection interrupted"));
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    await act(async () => button("Review route").click());
    const maximumFee = container.querySelectorAll("input")[1];
    if (!(maximumFee instanceof HTMLInputElement)) throw new Error("Missing maximum fee input");
    await setInputValue(maximumFee, "0.01");
    await act(async () => button("Acquire USDFC").click());

    expect(container.textContent).toContain("Connection interrupted");
    expect(container.textContent).toContain(
      "Outcome needs verification. Check wallet activity before starting another one.",
    );
    expect(button("Acquire USDFC").disabled).toBe(true);
  });

  it("requires a fresh review when the reviewed route expires", async () => {
    planSquidTopUp.mockResolvedValueOnce({
      maxSourceAmount: 2_000_000_000_000_000_000n,
      owner: wallet.address,
      quotes: [{ actions: [], costs: [], destinationAmount: 1n, expiresAt: 1, sourceAmount: 1n }],
      slippage: 1,
      source: sourceTokens[0],
    });
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    await act(async () => button("Review route").click());
    const maximumFee = container.querySelectorAll("input")[1];
    if (!(maximumFee instanceof HTMLInputElement)) throw new Error("Missing maximum fee input");
    await setInputValue(maximumFee, "0.01");
    await act(async () => button("Acquire USDFC").click());

    expect(container.textContent).toContain("This route expired. Review it again before acquiring USDFC.");
    expect(executeSquidTopUp).not.toHaveBeenCalled();
  });

  it("keeps acquisition processing until the executor settles", async () => {
    let resolveExecution: (() => void) | undefined;
    executeSquidTopUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecution = () => resolve({ nativeFee: 1n, routes: [], sourceAmount: 2n });
        }),
    );
    await act(async () => root.render(<QuoteHarness />));
    await selectQuoteInput();
    await act(async () => button("Review route").click());
    const maximumFee = container.querySelectorAll("input")[1];
    if (!(maximumFee instanceof HTMLInputElement)) throw new Error("Missing maximum fee input");
    await setInputValue(maximumFee, "0.01");
    act(() => button("Acquire USDFC").click());

    expect(button("Acquiring USDFC...").disabled).toBe(true);
    await act(async () => resolveExecution?.());
  });
});
