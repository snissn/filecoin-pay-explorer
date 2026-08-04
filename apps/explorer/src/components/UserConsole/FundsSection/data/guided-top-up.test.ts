import { describe, expect, it, vi } from "vitest";
import { EPOCHS_PER_DAY } from "./funding-runway";
import {
  calculateProjectedFundingRunway,
  parseTopUpAmount,
  submitGuidedTopUp,
  withoutTopUpSearchParam,
} from "./guided-top-up";

const rate = 10_000_000_000_000n;
const now = 1_767_225_600n;

describe("guided top-up", () => {
  it("parses an editable 18-decimal USDFC amount", () => {
    expect(parseTopUpAmount("1.25")).toBe(1_250_000_000_000_000_000n);
    expect(parseTopUpAmount("0")).toBeNull();
    expect(parseTopUpAmount("not-a-number")).toBeNull();
  });

  it("projects a deposit after clearing existing debt", () => {
    const projected = calculateProjectedFundingRunway(
      {
        availableFunds: 0n,
        debt: rate * EPOCHS_PER_DAY,
        lockupRatePerEpoch: rate,
        runwayInEpochs: 0n,
      },
      rate * EPOCHS_PER_DAY * 366n,
      now,
    );

    expect(projected.status).toBe("long-term-funded");
    expect(projected.runwayInEpochs).toBe(365n * EPOCHS_PER_DAY);
  });

  it("removes only the top-up parameter from the URL", () => {
    expect(withoutTopUpSearchParam(new URLSearchParams("topUp=1&account=0xabc&network=calibration"))).toBe(
      "?account=0xabc&network=calibration",
    );
  });

  it("submits only the confirmed editable amount and refreshes after its receipt", async () => {
    const onHash = vi.fn();
    const fundSync = vi.fn(async ({ onHash: submitted }: { onHash: (hash: `0x${string}`) => void }) => {
      submitted("0x1234");
      return { receipt: { status: "success" as const } };
    });
    const onConfirmed = vi.fn(async () => undefined);

    await submitGuidedTopUp({ amount: 1_250_000_000_000_000_000n, fundSync, onSubmitted: onHash, onConfirmed });

    expect(fundSync).toHaveBeenCalledWith({ amount: 1_250_000_000_000_000_000n, onHash });
    expect(onConfirmed).toHaveBeenCalledOnce();
  });

  it("does not refresh when the wallet rejects the confirmed top-up", async () => {
    const onConfirmed = vi.fn(async () => undefined);

    await expect(
      submitGuidedTopUp({
        amount: 1n,
        fundSync: async () => Promise.reject(new Error("User rejected")),
        onSubmitted: () => undefined,
        onConfirmed,
      }),
    ).rejects.toThrow("User rejected");

    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("does not refresh when the confirmed transaction reverts", async () => {
    const onConfirmed = vi.fn(async () => undefined);

    await expect(
      submitGuidedTopUp({
        amount: 1n,
        fundSync: async () => ({ receipt: { status: "reverted" } }),
        onSubmitted: () => undefined,
        onConfirmed,
      }),
    ).rejects.toThrow("Top-up transaction reverted");

    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
