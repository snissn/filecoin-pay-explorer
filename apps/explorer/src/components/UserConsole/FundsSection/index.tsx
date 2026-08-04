import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import type { Account, UserToken } from "@filecoin-pay/types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { DepositDialog } from "@/components/UserConsole/DepositDialog";
import { WithdrawDialog } from "@/components/UserConsole/WithdrawDialog";
import { useAccountTokens } from "@/hooks/useAccountDetails";
import { useAccountFundingSummary } from "@/hooks/useAccountFundingSummary";
import useSynapse from "@/hooks/useSynapse";
import { getNetworkFromChainId } from "@/utils/network";
import {
  FundingRunway,
  FundsEmptyState,
  FundsErrorState,
  FundsLoadingState,
  FundsTable,
  GuidedTopUpDialog,
} from "./components";
import { withoutTopUpSearchParam } from "./data/guided-top-up";

interface FundsSectionProps {
  account: Account;
  topUpOnly?: boolean;
}

export const FundsSection: React.FC<FundsSectionProps> = ({ account, topUpOnly = false }) => {
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [guidedTopUpAmount, setGuidedTopUpAmount] = useState("");

  const { address, chainId } = useAccount();
  const { synapse } = useSynapse();
  const walletNetwork = getNetworkFromChainId(chainId);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guidedTopUpOpen, setGuidedTopUpOpen] = useState(searchParams.get("topUp") === "1");

  const { data, isLoading, isError } = useAccountTokens(account.id, 1, { networkOverride: walletNetwork });
  const { data: fundingSummary, isError: isFundingSummaryError } = useAccountFundingSummary(
    address,
    walletNetwork,
    synapse,
  );

  const handleDeposit = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setDepositDialogOpen(true);
  }, []);

  const handleWithdraw = useCallback((userToken: UserToken) => {
    setSelectedToken(userToken);
    setWithdrawDialogOpen(true);
  }, []);

  const handleOpenDeposit = useCallback(() => {
    setDepositDialogOpen(true);
  }, []);

  const handleOpenGuidedTopUp = useCallback((amount: string) => {
    setGuidedTopUpAmount(amount);
    setGuidedTopUpOpen(true);
  }, []);

  const handleGuidedTopUpOpenChange = useCallback(
    (open: boolean) => {
      setGuidedTopUpOpen(open);
      if (!open && searchParams.has("topUp")) {
        router.replace(`${pathname}${withoutTopUpSearchParam(searchParams)}`);
      }
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (searchParams.get("topUp") === "1") setGuidedTopUpOpen(true);
  }, [searchParams]);

  // Prepare data with action handlers
  const tableData = useMemo(
    () =>
      data?.userTokens.map((token) => ({
        ...token,
        onDeposit: handleDeposit,
        onWithdraw: handleWithdraw,
      })) || [],
    [data?.userTokens, handleDeposit, handleWithdraw],
  );
  let fundsContent: ReactNode;
  if (isLoading) {
    fundsContent = <FundsLoadingState onDeposit={handleOpenDeposit} />;
  } else if (isError) {
    fundsContent = <FundsErrorState onDeposit={handleOpenDeposit} />;
  } else if (!data || data.userTokens.length === 0) {
    fundsContent = <FundsEmptyState onDeposit={handleOpenDeposit} />;
  } else {
    fundsContent = (
      <>
        <div className='flex items-center justify-between'>
          <h3 className='text-2xl font-medium'>Funds</h3>
          <Button className='py-2' variant='primary' onClick={handleOpenDeposit}>
            Deposit
          </Button>
        </div>
        <FundsTable data={tableData} />

        {/* Deposit Dialogs */}
        <DepositDialog userToken={selectedToken} open={depositDialogOpen} onOpenChange={setDepositDialogOpen} />

        {selectedToken && (
          <WithdrawDialog userToken={selectedToken} open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen} />
        )}
      </>
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      {isFundingSummaryError && !topUpOnly && (
        <p className='text-sm text-destructive' role='alert'>
          Funding runway is unavailable. Check your wallet connection and try again.
        </p>
      )}
      {fundingSummary && !topUpOnly && <FundingRunway onTopUp={handleOpenGuidedTopUp} summary={fundingSummary} />}
      {fundingSummary && (
        <GuidedTopUpDialog
          accountId={account.id}
          amount={guidedTopUpAmount}
          network={walletNetwork}
          onOpenChange={handleGuidedTopUpOpenChange}
          open={guidedTopUpOpen}
          summary={fundingSummary}
        />
      )}
      {!topUpOnly && fundsContent}
    </div>
  );
};
