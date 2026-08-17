import type { Subscription } from "@filecoin-pay/types/boss";
import type { ReactNode } from "react";
import type { BossStatusDescription, BossStatusTone } from "@/services/boss/presentation";
import { formatBossState, getBossStateTone } from "@/services/boss/presentation";

const TONE_CLASSES: Record<BossStatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
  warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  error: "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100",
  neutral: "border-border bg-muted/40 text-foreground",
};

const BADGE_CLASSES: Record<BossStatusTone, string> = {
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  error: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  neutral: "bg-muted text-muted-foreground",
};

interface BossStatusPanelProps {
  title: string;
  status: BossStatusDescription;
  metadata?: string;
}

export function BossStatusPanel({ title, status, metadata }: BossStatusPanelProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${TONE_CLASSES[status.tone]}`}
      role={status.tone === "error" || status.tone === "warning" ? "alert" : "status"}
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-xs font-semibold uppercase tracking-wide opacity-70'>{title}</p>
          <p className='mt-1 font-semibold'>{status.label}</p>
          <p className='mt-1 text-sm opacity-80'>{status.detail}</p>
        </div>
        {metadata && <code className='max-w-full break-all text-xs opacity-70'>{metadata}</code>}
      </div>
    </div>
  );
}

export function BossStateBadge({ state }: { state: Subscription["state"] }) {
  const tone = getBossStateTone(state);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_CLASSES[tone]}`}>
      {formatBossState(state)}
    </span>
  );
}

interface BossDetailFieldProps {
  label: string;
  value: ReactNode;
  detail?: string;
}

export function BossDetailField({ label, value, detail }: BossDetailFieldProps) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{label}</dt>
      <dd className='mt-1 min-w-0 break-words text-sm font-medium text-foreground'>{value}</dd>
      {detail && <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>}
    </div>
  );
}

interface BossSectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function BossSectionCard({ title, description, children }: BossSectionCardProps) {
  return (
    <section className='rounded-xl border bg-background p-5 shadow-sm'>
      <div className='mb-4'>
        <h2 className='text-lg font-semibold'>{title}</h2>
        {description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
      </div>
      {children}
    </section>
  );
}
