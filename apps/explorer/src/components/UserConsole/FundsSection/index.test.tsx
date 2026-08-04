// @vitest-environment happy-dom

import type { Account } from "@filecoin-pay/types";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FundsSection } from ".";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => ({ chainId: 314159 }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/console",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));
vi.mock("@/hooks/useSynapse", () => ({ default: () => ({ synapse: {} }) }));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountTokens: () => ({ data: { userTokens: [] }, isError: false, isLoading: false }),
}));
vi.mock("@/hooks/useAccountFundingSummary", () => ({
  useAccountFundingSummary: () => ({
    data: { availableFunds: 0n, debt: 0n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n },
    isError: true,
  }),
}));
vi.mock("@/components/UserConsole/DepositDialog", () => ({ DepositDialog: () => null }));
vi.mock("@/components/UserConsole/WithdrawDialog", () => ({ WithdrawDialog: () => null }));
vi.mock("./components", () => ({
  FundingRunway: () => <div>Funding runway</div>,
  GuidedTopUpDialog: ({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) => (
    <div>
      {open ? "Guided top-up open" : "Guided top-up closed"}
      {open && (
        <button onClick={() => onOpenChange(false)} type='button'>
          Close guided top-up
        </button>
      )}
    </div>
  ),
  FundsEmptyState: () => <div>No funds</div>,
  FundsErrorState: () => <div>Funds error</div>,
  FundsLoadingState: () => <div>Loading funds</div>,
  FundsTable: () => null,
}));

describe("FundsSection", () => {
  const account: Account = {
    __typename: "Account",
    address: "0xaccount",
    id: "0xaccount",
    operatorApprovals: [],
    payeeRails: [],
    payerRails: [],
    totalApprovals: 0n,
    totalRails: 0n,
    totalTokens: 0n,
    userTokens: [],
  };

  it("renders funding runway and its read error independently of an empty token result", () => {
    navigation.searchParams = new URLSearchParams();
    const markup = renderToStaticMarkup(<FundsSection account={account} />);

    expect(markup).toContain("Funding runway");
    expect(markup).toContain("Funding runway is unavailable");
    expect(markup).toContain("No funds");
  });

  it("opens from the stable URL and preserves unrelated parameters when closed", async () => {
    navigation.searchParams = new URLSearchParams("topUp=1&network=calibration&account=0xabc");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(<FundsSection account={account} />));
    expect(container.textContent).toContain("Guided top-up open");

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Close guided top-up",
    );
    if (!closeButton) throw new Error("Missing guided top-up close button");
    await act(async () => closeButton.click());

    expect(navigation.replace).toHaveBeenCalledWith("/console?network=calibration&account=0xabc");

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps only guided top-up mounted for an external source chain", () => {
    navigation.searchParams = new URLSearchParams("topUp=1");
    const markup = renderToStaticMarkup(<FundsSection account={account} topUpOnly />);

    expect(markup).toContain("Guided top-up open");
    expect(markup).not.toContain("Funding runway");
    expect(markup).not.toContain("No funds");
  });
});
