import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserConsole from "./page";

const wallet = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  chainId: 42161,
  isConnected: true,
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => wallet,
}));
vi.mock("@/components/shared", () => ({ CustomConnectButton: () => null }));
vi.mock("@/components/UserConsole/ConsoleProviders", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/UserConsole/States", () => ({
  AccountNotFound: () => <div>Account not found</div>,
  ErrorState: () => <div>Account error</div>,
  NotConnected: () => <div>Not connected</div>,
  UnsupportedChain: () => <div>Unsupported network</div>,
}));
vi.mock("@/components/UserConsole", () => ({
  BetaWarning: () => null,
  FundsSection: ({ topUpOnly }: { topUpOnly?: boolean }) => <div>{topUpOnly ? "Guided top-up" : "Funds"}</div>,
  OperatorApprovalsSection: () => <div>Approvals</div>,
  RailsSection: () => <div>Rails</div>,
}));
vi.mock("@/hooks/useAccountDetails", () => ({
  useAccountDetails: () => ({
    data: { id: "0x1111111111111111111111111111111111111111" },
    error: null,
    isError: false,
    isLoading: false,
  }),
}));

describe("UserConsole", () => {
  beforeEach(() => {
    wallet.chainId = 42161;
  });

  it("keeps guided top-up mounted but hides Filecoin-only dashboard sections on a Squid source chain", () => {
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Guided top-up");
    expect(markup).not.toContain("Unsupported network");
    expect(markup).not.toContain("Approvals");
    expect(markup).not.toContain("Rails");
  });

  it("keeps the full console on Filecoin", () => {
    wallet.chainId = 314;
    const markup = renderToStaticMarkup(<UserConsole />);

    expect(markup).toContain("Funds");
    expect(markup).toContain("Approvals");
    expect(markup).toContain("Rails");
  });
});
