// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EPOCHS_PER_DAY } from "../data/funding-runway";
import { GuidedTopUpDialog } from "./GuidedTopUpDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  fundSync: vi.fn(),
  info: vi.fn(),
  invalidateQueries: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/hooks/useSynapse", () => ({
  default: () => ({ synapse: { payments: { fundSync: mocks.fundSync } } }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, info: mocks.info, success: mocks.success },
}));
vi.mock("@filecoin-foundation/ui-filecoin/Button", () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => <button {...props}>{children}</button>,
}));
vi.mock("@filecoin-foundation/ui-filecoin/Input", () => ({
  Input: ({
    onChange,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) => (
    <input {...props} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@filecoin-pay/ui/components/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const summary = {
  availableFunds: 0n,
  debt: 0n,
  lockupRatePerEpoch: 10_000_000_000_000n,
  runwayInEpochs: 0n * EPOCHS_PER_DAY,
};

describe("GuidedTopUpDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const renderDialog = async (
    onOpenChange: (open: boolean) => void,
    dialogSummary: typeof summary = summary,
    amount = "1.25",
  ) => {
    await act(async () =>
      root.render(
        <GuidedTopUpDialog
          accountId='0xaccount'
          amount={amount}
          network='calibration'
          onOpenChange={onOpenChange}
          open
          summary={dialogSummary}
        />,
      ),
    );
  };

  const button = (label: string) => {
    const match = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  };

  const setInputValue = async (input: HTMLInputElement, value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Missing input value setter");
    await act(async () => {
      setValue.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("submits the edited amount and refreshes only after a successful receipt", async () => {
    let confirmTransaction: ((value: { receipt: { status: "success" } }) => void) | undefined;
    mocks.fundSync.mockImplementation(
      ({ onHash }: { onHash: (hash: `0x${string}`) => void }) =>
        new Promise((resolve) => {
          confirmTransaction = resolve;
          onHash("0x1234");
        }),
    );
    const onOpenChange = vi.fn();
    await renderDialog(onOpenChange);

    const input = container.querySelector("#guided-top-up-amount");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing top-up amount input");
    await setInputValue(input, "0.001");
    await act(async () => button("Confirm top-up").click());

    expect(mocks.fundSync).toHaveBeenCalledWith({ amount: 1_000_000_000_000_000n, onHash: expect.any(Function) });
    expect(mocks.info).toHaveBeenCalledWith("Top-up transaction submitted");
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();

    await act(async () => confirmTransaction?.({ receipt: { status: "success" } }));
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["account", "0xaccount", "funding-summary", "calibration"],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["account", "0xaccount", "tokens"],
    });
    expect(mocks.success).toHaveBeenCalledWith("USDFC top-up confirmed");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the review open and does not refresh when confirmation fails", async () => {
    mocks.fundSync.mockRejectedValue(new Error("User rejected"));
    const onOpenChange = vi.fn();
    await renderDialog(onOpenChange);

    await act(async () => button("Confirm top-up").click());
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps an edited amount when the funding summary refreshes", async () => {
    const onOpenChange = vi.fn();
    await renderDialog(onOpenChange);
    const input = container.querySelector("#guided-top-up-amount");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing top-up amount input");

    await setInputValue(input, "0.001");
    await renderDialog(onOpenChange, { ...summary, availableFunds: 1n });

    expect(input.value).toBe("0.001");
  });

  it("shows indebted accounts as underfunded before and after a partial top-up", async () => {
    await renderDialog(vi.fn(), { ...summary, debt: 2_000_000_000_000_000_000n }, "0.5");

    expect(container.textContent?.match(/Underfunded/g)).toHaveLength(2);
  });
});
