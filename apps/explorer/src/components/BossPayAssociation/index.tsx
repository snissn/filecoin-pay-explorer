"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { PageSection } from "@filecoin-foundation/ui-filecoin/PageSection";
import type { Subscription } from "@filecoin-pay/types/boss";
import Link from "next/link";
import { useBossPayRailAssociation } from "@/hooks/useBossPayRailAssociation";
import type { Network } from "@/types";

interface BossPayAssociationProps {
  network: Network;
  railId: string;
  subscription?: Subscription;
  standalone?: boolean;
}

export default function BossPayAssociation({
  network,
  railId,
  subscription,
  standalone = false,
}: BossPayAssociationProps) {
  const { state, refetch } = useBossPayRailAssociation({ network, railId, subscription });

  if (state.status === "no-boss-record") {
    return null;
  }

  const content = (
    <section className='rounded-xl border bg-background p-5 shadow-sm' aria-labelledby='boss-pay-association-title'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Cross-source proof</p>
          <h2 id='boss-pay-association-title' className='mt-1 text-lg font-semibold'>
            Boss ↔ Filecoin Pay association
          </h2>
        </div>
        <AssociationBadge status={state.status} />
      </div>

      {state.status === "loading" && <p className='mt-4 text-sm text-muted-foreground'>{state.message}</p>}

      {state.status === "pending-index" && (
        <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100' role='status'>
          <p className='font-semibold'>Waiting for {state.source === "boss" ? "Boss" : "Filecoin Pay"} indexing</p>
          <p className='mt-1'>{state.message}</p>
        </div>
      )}

      {state.status === "unverifiable" && (
        <div className='mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-100' role='alert'>
          <p className='font-semibold'>Association cannot be verified</p>
          <ul className='mt-2 list-disc space-y-1 pl-5'>
            {state.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <Button className='mt-3' onClick={() => void refetch()} variant='secondary' size='compact'>
            Retry proof
          </Button>
        </div>
      )}

      {state.status === "mismatched" && (
        <div className='mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100' role='alert'>
          <p className='font-semibold'>Indexed sources disagree; this rail is not labeled as Boss</p>
          <ul className='mt-3 space-y-3'>
            {state.mismatches.map((mismatch, index) => (
              <li key={`${mismatch.field}-${mismatch.leftLabel}-${mismatch.rightLabel}-${index}`}>
                <p className='font-medium'>{mismatch.field}</p>
                <p className='mt-1 break-all text-xs'>
                  {mismatch.leftLabel}: <code>{mismatch.left}</code>
                </p>
                <p className='break-all text-xs'>
                  {mismatch.rightLabel}: <code>{mismatch.right}</code>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.status === "matched" && (
        <div className='mt-4 space-y-4'>
          <p className='rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100' role='status'>
            Chain, Filecoin Pay authority, Boss account/operator, subscription ID, rail ID, payer, payee, token,
            and validator all match. The association is {state.association.active ? "currently active" : "historical/inactive"}.
          </p>
          <dl className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <AssociationField label='Subscription ID' value={state.association.subscriptionId} />
            <AssociationField label='Rail ID' value={state.association.railId} />
            <AssociationField label='Boss account / operator' value={state.association.bossAccount} />
            <AssociationField label='Payer' value={state.association.payer} />
            <AssociationField label='Payee' value={state.association.payee} />
            <AssociationField label='Validator' value={state.association.validator} />
            <AssociationField label='Token' value={state.association.token} />
            <AssociationField label='Filecoin Pay' value={state.association.filecoinPay} />
            <AssociationField label='Chain ID' value={state.association.chainId.toString()} />
          </dl>
          <div className='flex flex-wrap gap-4 text-sm font-semibold'>
            <Link
              href={`/${network}/services/${encodeURIComponent(state.association.subscriptionEntityId)}`}
              className='text-primary underline-offset-4 hover:underline'
            >
              Open Boss service
            </Link>
            <Link
              href={`/${network}/rails/${encodeURIComponent(state.association.railId)}`}
              className='text-primary underline-offset-4 hover:underline'
            >
              Open Filecoin Pay rail
            </Link>
          </div>
        </div>
      )}
    </section>
  );

  return standalone ? <PageSection backgroundVariant='light'>{content}</PageSection> : content;
}

function AssociationBadge({ status }: { status: Exclude<ReturnType<typeof useBossPayRailAssociation>["state"]["status"], "no-boss-record"> }) {
  const labels = {
    loading: "Checking",
    "pending-index": "Pending index",
    unverifiable: "Unverifiable",
    mismatched: "Mismatch",
    matched: "Verified",
  } as const;
  const classes = {
    loading: "bg-muted text-muted-foreground",
    "pending-index": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    unverifiable: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
    mismatched: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
    matched: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  } as const;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{labels[status]}</span>;
}

function AssociationField({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{label}</dt>
      <dd className='mt-1 break-all font-mono text-xs'>{value}</dd>
    </div>
  );
}
