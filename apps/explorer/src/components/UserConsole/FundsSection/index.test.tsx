import type { Account } from "@filecoin-pay/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FundsSection } from ".";

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => ({ chainId: 314 }),
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
  FundsEmptyState: () => <div>No funds</div>,
  FundsErrorState: () => <div>Funds error</div>,
  FundsLoadingState: () => <div>Loading funds</div>,
  FundsTable: () => null,
}));

describe("FundsSection", () => {
  it("renders funding runway and its read error independently of an empty token result", () => {
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
    const markup = renderToStaticMarkup(<FundsSection account={account} />);

    expect(markup).toContain("Funding runway");
    expect(markup).toContain("Funding runway is unavailable");
    expect(markup).toContain("No funds");
  });
});
