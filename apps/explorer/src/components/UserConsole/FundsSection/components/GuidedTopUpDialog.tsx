"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { Input } from "@filecoin-foundation/ui-filecoin/Input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@filecoin-pay/ui/components/dialog";
import { Label } from "@filecoin-pay/ui/components/label";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatUnits } from "viem";
import useSynapse from "@/hooks/useSynapse";
import type { Network } from "@/types";
import { formatDate } from "@/utils/formatter";
import { calculateFundingRunway, type FundingRunwayInput, USDFC_DECIMALS } from "../data/funding-runway";
import { calculateProjectedFundingRunway, parseTopUpAmount, submitGuidedTopUp } from "../data/guided-top-up";
import { SquidQuoteReview } from "./SquidQuoteReview";

type GuidedTopUpDialogProps = {
  accountId: string;
  amount: string;
  network: Network;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  summary: Omit<FundingRunwayInput, "nowTimestamp">;
};

export function GuidedTopUpDialog({
  accountId,
  amount: initialAmount,
  network,
  onOpenChange,
  open,
  summary,
}: GuidedTopUpDialogProps) {
  const { synapse } = useSynapse();
  const queryClient = useQueryClient();
  const nowTimestamp = BigInt(Math.floor(Date.now() / 1_000));
  const suggestedAmount = formatUnits(
    calculateFundingRunway({ ...summary, nowTimestamp }).suggestedTopUp,
    USDFC_DECIMALS,
  );
  const [amount, setAmount] = useState(initialAmount || suggestedAmount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wasOpen = useRef(false);
  const parsedAmount = parseTopUpAmount(amount);
  const current = useMemo(() => calculateFundingRunway({ ...summary, nowTimestamp }), [nowTimestamp, summary]);
  const projected = useMemo(
    () => (parsedAmount === null ? null : calculateProjectedFundingRunway(summary, parsedAmount, nowTimestamp)),
    [nowTimestamp, parsedAmount, summary],
  );

  useEffect(() => {
    if (open && !wasOpen.current) setAmount(initialAmount || suggestedAmount);
    wasOpen.current = open;
  }, [initialAmount, open, suggestedAmount]);

  const handleConfirm = async () => {
    if (!synapse || parsedAmount === null || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitGuidedTopUp({
        amount: parsedAmount,
        fundSync: (options) => synapse.payments.fundSync(options),
        onSubmitted: () => toast.info("Top-up transaction submitted"),
        onConfirmed: () =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: ["account", accountId, "funding-summary", network] }),
            queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
          ]).then(() => undefined),
      });
      toast.success("USDFC top-up confirmed");
      onOpenChange(false);
    } catch (error) {
      toast.error("USDFC top-up failed", {
        description: error instanceof Error ? error.message : "Your wallet did not complete the request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fundedThrough = (timestamp: bigint | null, debt: bigint) => {
    if (debt > 0n) return "Underfunded";
    return timestamp === null ? "No active spend" : formatDate(timestamp);
  };
  const projectedDebt = parsedAmount === null || parsedAmount >= summary.debt ? 0n : summary.debt - parsedAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Top up with USDFC</DialogTitle>
          <DialogDescription>
            Deposit Filecoin USDFC into Filecoin Pay. Your wallet will ask for confirmation before any transaction.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='guided-top-up-amount'>Amount (USDFC)</Label>
            <Input id='guided-top-up-amount' min='0' onChange={setAmount} step='any' type='number' value={amount} />
            {parsedAmount === null && <p className='text-sm text-destructive'>Enter an amount greater than zero.</p>}
          </div>
          <div className='grid gap-2 rounded-md border p-3 text-sm'>
            <p>
              Current funded through:{" "}
              <span className='font-medium'>{fundedThrough(current.fundedThroughTimestamp, summary.debt)}</span>
            </p>
            <p>
              Projected funded through:{" "}
              <span className='font-medium'>
                {projected ? fundedThrough(projected.fundedThroughTimestamp, projectedDebt) : "—"}
              </span>
            </p>
            <p className='text-muted-foreground'>
              You will deposit {parsedAmount === null ? "—" : formatUnits(parsedAmount, USDFC_DECIMALS)} USDFC.
            </p>
          </div>
          <SquidQuoteReview destinationAmount={parsedAmount} network={network} />
        </div>
        <DialogFooter>
          <Button disabled={isSubmitting} onClick={() => onOpenChange(false)} variant='ghost'>
            Cancel
          </Button>
          <Button
            disabled={!synapse || parsedAmount === null || isSubmitting}
            onClick={handleConfirm}
            variant='primary'
          >
            {isSubmitting ? "Confirming..." : "Confirm top-up"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
