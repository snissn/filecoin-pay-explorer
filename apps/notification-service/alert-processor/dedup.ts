import { and, eq, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { DB } from "../shared/db/client";
import { type AlertLevel, alertClaims, notificationLog } from "../shared/db/schema";

const SECONDS_PER_DAY = 86_400;
// Longer than Cloudflare Queues' 15-minute consumer wall-time limit, so an
// expired claim cannot overlap the invocation that originally made it.
export const CLAIM_LEASE_SECONDS = 16 * 60;

/**
 * Days a fired alert suppresses the same tier for a wallet before we re-alert on
 * a still-unresolved incident. A more severe tier has a shorter window so a
 * worsening account is nudged sooner.
 */
export const RE_ALERT_WINDOWS: Record<AlertLevel, number> = {
  warning: 16,
  critical: 5,
  emergency: 2,
};

export type ClaimResult = "claimed" | "pending" | "suppressed";

/**
 * Atomically claims a wallet/tier before email delivery. Concurrent queue
 * deliveries race on one D1 primary key, so only one caller receives a row.
 */
export async function claimAlert(db: DB, wallet: string, tier: AlertLevel, nowSec: number): Promise<ClaimResult> {
  const escalation =
    tier === "emergency"
      ? ne(alertClaims.alertLevel, "emergency")
      : tier === "critical"
        ? eq(alertClaims.alertLevel, "warning")
        : undefined;
  const sentEscalation = escalation == null ? undefined : and(isNotNull(alertClaims.sentAt), escalation);
  const rows = await db
    .insert(alertClaims)
    .values({ walletAddress: wallet, alertLevel: tier, claimedAt: nowSec, sentAt: null })
    .onConflictDoUpdate({
      target: alertClaims.walletAddress,
      set: { alertLevel: tier, claimedAt: nowSec, sentAt: null },
      setWhere: or(
        sentEscalation,
        and(isNull(alertClaims.sentAt), lte(alertClaims.claimedAt, nowSec - CLAIM_LEASE_SECONDS)),
        and(
          isNotNull(alertClaims.sentAt),
          eq(alertClaims.alertLevel, tier),
          lte(alertClaims.sentAt, nowSec - RE_ALERT_WINDOWS[tier] * SECONDS_PER_DAY),
        ),
      ),
    })
    .returning({ walletAddress: alertClaims.walletAddress });
  if (rows.length === 1) return "claimed";
  const [current] = await db
    .select({ sentAt: alertClaims.sentAt })
    .from(alertClaims)
    .where(eq(alertClaims.walletAddress, wallet))
    .limit(1);
  return current?.sentAt == null ? "pending" : "suppressed";
}

/** Recovery starts a new incident the next time the wallet becomes at risk. */
export async function clearAlertClaim(db: DB, wallet: string): Promise<void> {
  await db.delete(alertClaims).where(eq(alertClaims.walletAddress, wallet));
}

/** A failed email releases only the claim made by that delivery. */
export async function releaseAlertClaim(db: DB, wallet: string, tier: AlertLevel, claimedAt: number): Promise<void> {
  await db
    .delete(alertClaims)
    .where(
      and(
        eq(alertClaims.walletAddress, wallet),
        eq(alertClaims.alertLevel, tier),
        eq(alertClaims.claimedAt, claimedAt),
      ),
    );
}

export type SentRecord = {
  tier: AlertLevel;
  /** Lowercased wallet address. */
  wallet: string;
  /** Unix seconds the account's funds run out (for the audit log). */
  fundedUntilSec: number;
  /** Unix seconds the alert was sent. */
  sentAtSec: number;
  /** Address the alert email was delivered to. */
  emailSentTo: string;
};

/**
 * Promotes the exact claim to sent, then appends the durable audit row.
 */
export async function recordSent(db: DB, entry: SentRecord): Promise<void> {
  await db
    .update(alertClaims)
    .set({ sentAt: entry.sentAtSec })
    .where(
      and(
        eq(alertClaims.walletAddress, entry.wallet),
        eq(alertClaims.alertLevel, entry.tier),
        eq(alertClaims.claimedAt, entry.sentAtSec),
      ),
    );
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    walletAddress: entry.wallet,
    alertLevel: entry.tier,
    fundedUntil: entry.fundedUntilSec,
    sentAt: entry.sentAtSec,
    emailSentTo: entry.emailSentTo,
  });
}
