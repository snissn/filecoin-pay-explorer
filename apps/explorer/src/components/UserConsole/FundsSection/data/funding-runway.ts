export const EPOCH_DURATION_SECONDS = 30n;
export const ONE_YEAR_DAYS = 365n;
export const USDFC_DECIMALS = 18;
export const SECONDS_PER_DAY = 24n * 60n * 60n;
export const EPOCHS_PER_DAY = SECONDS_PER_DAY / EPOCH_DURATION_SECONDS;
export const ONE_YEAR_EPOCHS = ONE_YEAR_DAYS * EPOCHS_PER_DAY;

export type FundingStatus = "long-term-funded" | "funded" | "low" | "urgent" | "critical" | "no-active-spend";

export type FundingRunwayInput = {
  availableFunds: bigint;
  debt: bigint;
  lockupRatePerEpoch: bigint;
  runwayInEpochs: bigint;
  nowTimestamp: bigint;
};

export type FundingRunway = {
  fundedThroughTimestamp: bigint | null;
  runwayInEpochs: bigint | null;
  status: FundingStatus;
  suggestedTopUp: bigint;
};

export function calculateFundingRunway({
  availableFunds,
  debt,
  lockupRatePerEpoch,
  runwayInEpochs,
  nowTimestamp,
}: FundingRunwayInput): FundingRunway {
  if (lockupRatePerEpoch === 0n) {
    return {
      fundedThroughTimestamp: null,
      runwayInEpochs: null,
      status: debt > 0n ? "critical" : "no-active-spend",
      suggestedTopUp: debt,
    };
  }

  const fundedThroughTimestamp = nowTimestamp + runwayInEpochs * EPOCH_DURATION_SECONDS;
  const suggestedTopUp = debt + lockupRatePerEpoch * ONE_YEAR_EPOCHS - availableFunds;

  return {
    fundedThroughTimestamp,
    runwayInEpochs,
    status: fundingStatus(runwayInEpochs, debt),
    suggestedTopUp: suggestedTopUp > 0n ? suggestedTopUp : 0n,
  };
}

function fundingStatus(runwayInEpochs: bigint, debt: bigint): FundingStatus {
  if (debt > 0n || runwayInEpochs < EPOCHS_PER_DAY) return "critical";
  if (runwayInEpochs < 7n * EPOCHS_PER_DAY) return "urgent";
  if (runwayInEpochs < 30n * EPOCHS_PER_DAY) return "low";
  if (runwayInEpochs < ONE_YEAR_EPOCHS) return "funded";
  return "long-term-funded";
}
