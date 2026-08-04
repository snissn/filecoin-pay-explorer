"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@filecoin-pay/ui/components/card";
import { formatUnits } from "viem";
import { formatDate } from "@/utils/formatter";
import {
  calculateFundingRunway,
  EPOCHS_PER_DAY,
  type FundingRunwayInput,
  type FundingStatus,
  USDFC_DECIMALS,
} from "../data/funding-runway";

const statusLabels: Record<FundingStatus, string> = {
  "long-term-funded": "Long-term funded",
  funded: "Funded",
  low: "Low",
  urgent: "Urgent",
  critical: "Critical",
  "no-active-spend": "No active spend",
};

const statusClasses: Record<FundingStatus, string> = {
  "long-term-funded": "text-green-600 dark:text-green-400",
  funded: "text-foreground",
  low: "text-amber-600 dark:text-amber-400",
  urgent: "text-orange-600 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
  "no-active-spend": "text-muted-foreground",
};

type FundingRunwayProps = {
  onTopUp?: (amount: string) => void;
  summary: Omit<FundingRunwayInput, "nowTimestamp">;
  nowTimestamp?: bigint;
};

export function FundingRunway({
  onTopUp,
  summary,
  nowTimestamp = BigInt(Math.floor(Date.now() / 1_000)),
}: FundingRunwayProps) {
  const runway = calculateFundingRunway({ ...summary, nowTimestamp });
  const suggestedAmount = formatUnits(runway.suggestedTopUp, USDFC_DECIMALS);

  const fundedThrough =
    runway.fundedThroughTimestamp === null ? "No active spend" : formatDate(runway.fundedThroughTimestamp);
  const remainingRunway =
    runway.runwayInEpochs === null
      ? "No active spend"
      : runway.runwayInEpochs < EPOCHS_PER_DAY
        ? "Less than 1 day"
        : `${runway.runwayInEpochs / EPOCHS_PER_DAY} days`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funding runway</CardTitle>
        <CardDescription>Estimate based on your current services and rates.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4 sm:grid-cols-4'>
        <div>
          <p className='text-sm text-muted-foreground'>Status</p>
          <p className={`font-medium ${statusClasses[runway.status]}`}>{statusLabels[runway.status]}</p>
        </div>
        <div>
          <p className='text-sm text-muted-foreground'>Funded through</p>
          <p className='font-medium'>{summary.debt > 0n ? "Underfunded" : fundedThrough}</p>
        </div>
        <div>
          <p className='text-sm text-muted-foreground'>Remaining runway</p>
          <p className='font-medium'>{remainingRunway}</p>
        </div>
        <div>
          <p className='text-sm text-muted-foreground'>Suggested top-up to one year</p>
          <p className='font-medium'>{suggestedAmount} USDFC</p>
          {onTopUp && (
            <Button className='mt-2' onClick={() => onTopUp(suggestedAmount)} variant='primary'>
              Top up
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
