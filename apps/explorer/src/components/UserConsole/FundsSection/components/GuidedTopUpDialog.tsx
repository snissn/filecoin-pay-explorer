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
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet } from "@/constants/chains";
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
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const nowTimestamp = BigInt(Math.floor(Date.now() / 1_000));
  const suggestedAmount = formatUnits(
    calculateFundingRunway({ ...summary, nowTimestamp }).suggestedTopUp,
    USDFC_DECIMALS,
  );
  const [amount, setAmount] = useState(initialAmount || suggestedAmount);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acquiredAmount, setAcquiredAmount] = useState<bigint | null>(null);
  const [acquisitionState, setAcquisitionState] = useState<"acquired" | "blocked" | "idle" | "processing">("idle");
  const wasOpen = useRef(false);
  const parsedAmount = parseTopUpAmount(amount);
  const depositAmount = acquiredAmount ?? parsedAmount;
  const current = useMemo(() => calculateFundingRunway({ ...summary, nowTimestamp }), [nowTimestamp, summary]);
  const projected = useMemo(
    () => (depositAmount === null ? null : calculateProjectedFundingRunway(summary, depositAmount, nowTimestamp)),
    [depositAmount, nowTimestamp, summary],
  );

  useEffect(() => {
    if (open && !wasOpen.current && acquiredAmount === null) {
      setAmount(initialAmount || suggestedAmount);
    }
    wasOpen.current = open;
  }, [acquiredAmount, initialAmount, open, suggestedAmount]);

  const handleConfirm = async () => {
    if (!synapse || depositAmount === null || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await submitGuidedTopUp({
        amount: depositAmount,
        fundSync: (options) => synapse.payments.fundSync(options),
        onSubmitted: () => toast.info("Top-up transaction submitted"),
        onConfirmed: () =>
          Promise.all([
            queryClient.invalidateQueries({ queryKey: ["account", address, "funding-summary", network] }),
            queryClient.invalidateQueries({ queryKey: ["account", accountId, "tokens"] }),
            queryClient.invalidateQueries({ queryKey: ["balance"] }),
            queryClient.invalidateQueries({ queryKey: ["readContract"] }),
          ]).then(() => undefined),
      });
      toast.success("USDFC top-up confirmed");
      setAcquiredAmount(null);
      setAcquisitionState("idle");
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
  const projectedDebt = depositAmount === null || depositAmount >= summary.debt ? 0n : summary.debt - depositAmount;

  const switchToFilecoin = async () => {
    try {
      await switchChainAsync({ chainId: mainnet.id });
    } catch (error) {
      toast.error("Could not switch to Filecoin", {
        description: error instanceof Error ? error.message : "Your wallet did not switch networks.",
      });
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && acquisitionState === "processing") {
      toast.info("Wait for the acquisition request to finish before closing this dialog.");
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <Input
              disabled={acquiredAmount !== null || acquisitionState !== "idle"}
              id='guided-top-up-amount'
              min='0'
              onChange={setAmount}
              step='any'
              type='number'
              value={amount}
            />
            {parsedAmount === null && acquiredAmount === null && (
              <p className='text-sm text-destructive'>Enter an amount greater than zero.</p>
            )}
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
              You will deposit {depositAmount === null ? "—" : formatUnits(depositAmount, USDFC_DECIMALS)} USDFC.
            </p>
          </div>
          <SquidQuoteReview
            acquisitionState={acquisitionState}
            destinationAmount={depositAmount}
            network={network}
            onAcquired={setAcquiredAmount}
            onAcquisitionStateChange={setAcquisitionState}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={isSubmitting || acquisitionState === "processing"}
            onClick={() => handleOpenChange(false)}
            variant='ghost'
          >
            Cancel
          </Button>
          {acquisitionState === "processing" ? (
            <Button disabled variant='primary'>
              Acquiring USDFC...
            </Button>
          ) : acquisitionState === "blocked" ? (
            <Button disabled variant='primary'>
              Verify acquisition before depositing
            </Button>
          ) : acquiredAmount !== null && chainId !== mainnet.id ? (
            <Button disabled={isSubmitting} onClick={switchToFilecoin} variant='primary'>
              Switch to Filecoin to deposit
            </Button>
          ) : (
            <Button
              disabled={!synapse || depositAmount === null || isSubmitting}
              onClick={handleConfirm}
              variant='primary'
            >
              {isSubmitting ? "Confirming..." : acquiredAmount === null ? "Confirm top-up" : "Deposit acquired USDFC"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
