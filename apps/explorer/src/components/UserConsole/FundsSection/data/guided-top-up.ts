import { type Hash, parseUnits } from "viem";
import { calculateFundingRunway, type FundingRunwayInput, USDFC_DECIMALS } from "./funding-runway";

export function parseTopUpAmount(amount: string): bigint | null {
  try {
    const parsedAmount = parseUnits(amount, USDFC_DECIMALS);
    return parsedAmount > 0n ? parsedAmount : null;
  } catch {
    return null;
  }
}

export function calculateProjectedFundingRunway(
  summary: Omit<FundingRunwayInput, "nowTimestamp">,
  amount: bigint,
  nowTimestamp: bigint,
) {
  const debtPaid = amount > summary.debt ? summary.debt : amount;
  const availableFunds = summary.availableFunds + amount - debtPaid;
  const debt = summary.debt - debtPaid;
  const addedRunway = summary.lockupRatePerEpoch === 0n ? 0n : (amount - debtPaid) / summary.lockupRatePerEpoch;

  return calculateFundingRunway({
    ...summary,
    availableFunds,
    debt,
    runwayInEpochs: summary.runwayInEpochs + addedRunway,
    nowTimestamp,
  });
}

export function withoutTopUpSearchParam(searchParams: URLSearchParams): string {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete("topUp");
  const query = nextSearchParams.toString();
  return query ? `?${query}` : "";
}

type FundSync = (options: {
  amount: bigint;
  onHash: (hash: Hash) => void;
}) => Promise<{ receipt: { status: "reverted" | "success" } }>;

export async function submitGuidedTopUp({
  amount,
  fundSync,
  onConfirmed,
  onSubmitted,
}: {
  amount: bigint;
  fundSync: FundSync;
  onConfirmed: () => Promise<void>;
  onSubmitted: () => void;
}) {
  const { receipt } = await fundSync({ amount, onHash: onSubmitted });
  if (receipt.status !== "success") throw new Error("Top-up transaction reverted");
  await onConfirmed();
}
