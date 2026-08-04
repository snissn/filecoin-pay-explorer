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
    [ONE_YEAR_EPOCHS, "long-term-funded"],
    [ONE_YEAR_EPOCHS - 1n, "funded"],
    [30n * EPOCHS_PER_DAY, "funded"],
    [30n * EPOCHS_PER_DAY - 1n, "low"],
    [7n * EPOCHS_PER_DAY, "low"],
    [7n * EPOCHS_PER_DAY - 1n, "urgent"],
    [EPOCHS_PER_DAY, "urgent"],
    [EPOCHS_PER_DAY - 1n, "critical"],
  ] as const)("maps %i epochs to %s", (runwayInEpochs, status) => {
    const result = calculateFundingRunway(input({ runwayInEpochs }));

    expect(result.status).toBe(status);
  });

  it("handles debt and accounts without active spend", () => {
    expect(calculateFundingRunway(input({ availableFunds: 0n, debt: 1n, runwayInEpochs: 0n }))).toMatchObject({
      status: "critical",
      suggestedTopUp: rate * ONE_YEAR_EPOCHS + 1n,
    });
    expect(calculateFundingRunway(input({ lockupRatePerEpoch: 0n, runwayInEpochs: 0n }))).toMatchObject({
      fundedThroughTimestamp: null,
      runwayInEpochs: null,
      status: "no-active-spend",
      suggestedTopUp: 0n,
    });
  });

  it("estimates the funded-through date and one-year shortfall", () => {
    const runwayInEpochs = 100n * EPOCHS_PER_DAY;
    const availableFunds = rate * runwayInEpochs;
    const result = calculateFundingRunway(input({ availableFunds, runwayInEpochs }));

    expect(result.fundedThroughTimestamp).toBe(now + runwayInEpochs * 30n);
    expect(result.suggestedTopUp).toBe(rate * (ONE_YEAR_EPOCHS - runwayInEpochs));
  });
});
