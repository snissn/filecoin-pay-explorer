import { describe, expect, it } from "vitest";
import { calculateFundingRunway, EPOCHS_PER_DAY, type FundingRunwayInput, ONE_YEAR_EPOCHS } from "./funding-runway";

const rate = 10n;
const now = 1_000_000n;

function input(overrides: Partial<FundingRunwayInput> = {}): FundingRunwayInput {
  return {
    availableFunds: rate * ONE_YEAR_EPOCHS,
    debt: 0n,
    lockupRatePerEpoch: rate,
    runwayInEpochs: ONE_YEAR_EPOCHS,
    nowTimestamp: now,
    ...overrides,
  };
}

describe("calculateFundingRunway", () => {
  it.each([
    [365n, "long-term-funded"],
    [30n, "funded"],
    [7n, "low"],
    [3n, "urgent"],
    [2n, "critical"],
    [1n, "critical"],
    [0n, "critical"],
  ] as const)("reports %i days as %s", (days, status) => {
    const result = calculateFundingRunway(input({ runwayInEpochs: days * EPOCHS_PER_DAY }));

    expect(result.status).toBe(status);
  });

  it("reports on-chain debt as critical and includes it in the suggested top-up", () => {
    const result = calculateFundingRunway(input({ availableFunds: 0n, debt: 1n, runwayInEpochs: 0n }));

    expect(result).toMatchObject({ status: "critical", suggestedTopUp: rate * ONE_YEAR_EPOCHS + 1n });
  });

  it("reports no active spend without a funded-through date", () => {
    const result = calculateFundingRunway(input({ lockupRatePerEpoch: 0n, runwayInEpochs: 0n }));

    expect(result).toMatchObject({ fundedThroughTimestamp: null, runwayInEpochs: null, status: "no-active-spend" });
  });

  it("suggests enough to clear debt even when there is no active spend", () => {
    const result = calculateFundingRunway(input({ availableFunds: 0n, debt: 1n, lockupRatePerEpoch: 0n }));

    expect(result).toMatchObject({ status: "critical", suggestedTopUp: 1n });
  });

  it("does not suggest a top-up when the account already has one year of funds", () => {
    const result = calculateFundingRunway(input());

    expect(result.suggestedTopUp).toBe(0n);
  });

  it("estimates the funded-through date from the current timestamp and on-chain runway", () => {
    const result = calculateFundingRunway(input({ runwayInEpochs: 2n }));

    expect(result.fundedThroughTimestamp).toBe(now + 60n);
  });

  it("suggests only the USDFC needed to reach one year", () => {
    const runwayInEpochs = 100n * EPOCHS_PER_DAY;
    const availableFunds = rate * runwayInEpochs;
    const result = calculateFundingRunway(input({ availableFunds, runwayInEpochs }));

    expect(result.suggestedTopUp).toBe(rate * (ONE_YEAR_EPOCHS - runwayInEpochs));
  });
});
