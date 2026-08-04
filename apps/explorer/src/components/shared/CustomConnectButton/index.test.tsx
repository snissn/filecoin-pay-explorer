import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CustomConnectButton from ".";

vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button type='button'>{children}</button>,
}));
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (props: Record<string, unknown>) => React.ReactNode }) =>
      children({
        account: { displayName: "0x1111…1111" },
        chain: { id: 42161, name: "Arbitrum" },
        mounted: true,
        openAccountModal: vi.fn(),
        openChainModal: vi.fn(),
        openConnectModal: vi.fn(),
      }),
  },
}));
vi.mock("./components", () => ({
  Balance: () => <div>Filecoin balance</div>,
  NetworkOptions: () => <div>Filecoin networks</div>,
}));

describe("CustomConnectButton", () => {
  it("shows the connected external chain and account without Filecoin-specific balances", () => {
    const markup = renderToStaticMarkup(<CustomConnectButton />);

    expect(markup).toContain("Arbitrum");
    expect(markup).toContain("0x1111…1111");
    expect(markup).not.toContain("Filecoin balance");
    expect(markup).not.toContain("Filecoin networks");
  });
});
