"use client";
import { LoadingStateCard } from "@filecoin-foundation/ui-filecoin/LoadingStateCard";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { CustomConnectButton } from "@/components/shared";
import { BetaWarning, FundsSection, OperatorApprovalsSection, RailsSection } from "@/components/UserConsole";
import ConsoleProviders from "@/components/UserConsole/ConsoleProviders";
import { SQUID_SOURCE_CHAINS } from "@/components/UserConsole/FundsSection/data/squid-quote";
import { AccountNotFound, ErrorState, NotConnected, UnsupportedChain } from "@/components/UserConsole/States";
import { useAccountDetails } from "@/hooks/useAccountDetails";
import { getNetworkFromChainId, isSupportedChainId } from "@/utils/network";

const UserConsoleContent = () => {
  const { address, isConnected, chainId } = useAccount();
  const walletNetwork = useMemo(() => getNetworkFromChainId(chainId), [chainId]);
  const isUnsupportedChain = Boolean(isConnected && chainId && !isSupportedChainId(chainId));
  const isExternalSquidSourceChain = isUnsupportedChain && SQUID_SOURCE_CHAINS.some((chain) => chain.id === chainId);

  const {
    data: account,
    isLoading,
    isError,
    error,
  } = useAccountDetails(address || "", { networkOverride: walletNetwork });

  return (
    <PageSection backgroundVariant='light'>
      <div className='flex flex-col gap-20 -mt-20'>
        <div className='flex justify-between items-center'>
          <h2 className='text-4xl font-medium'>Filecoin Pay Console</h2>
          {isConnected && <CustomConnectButton />}
        </div>

        {/* Beta Warning */}
        <BetaWarning />

        {/* Not Connected */}
        {(!isConnected || !address) && <NotConnected />}

        {/* Unsupported Chain */}
        {isUnsupportedChain && !isExternalSquidSourceChain && <UnsupportedChain />}

        {/* External source chains retain only the guided top-up flow. */}
        {isConnected && (!isUnsupportedChain || isExternalSquidSourceChain) && (
          <>
            {/* Loading */}
            {isLoading && <LoadingStateCard message='Loading your account details...' />}

            {/* Account Not Found */}
            {!isError && !isLoading && !account && <AccountNotFound />}

            {!isLoading && address && account && (
              <>
                <FundsSection account={account} topUpOnly={isExternalSquidSourceChain} />
                {!isExternalSquidSourceChain && (
                  <>
                    <RailsSection account={account} userAddress={address} />
                    <OperatorApprovalsSection account={account} />
                  </>
                )}
              </>
            )}

            {/* Error */}
            {isError && <ErrorState error={error} />}
          </>
        )}
      </div>
    </PageSection>
  );
};

const UserConsole = () => {
  return (
    <ConsoleProviders>
      <UserConsoleContent />
    </ConsoleProviders>
  );
};

export default UserConsole;
