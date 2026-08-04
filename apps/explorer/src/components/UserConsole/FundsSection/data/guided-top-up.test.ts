import { describe, expect, it } from "vitest";
import { EPOCHS_PER_DAY } from "./funding-runway";
import { calculateProjectedFundingRunway, parseTopUpAmount, withoutTopUpSearchParam } from "./guided-top-up";

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
});
