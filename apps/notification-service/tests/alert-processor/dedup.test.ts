import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAIM_LEASE_SECONDS,
  claimAlert,
  clearAlertClaim,
  RE_ALERT_WINDOWS,
  recordSent,
  releaseAlertClaim,
} from "../../alert-processor/dedup";
import { createDb } from "../../shared/db/client";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";
const NOW = Math.floor(new Date("2026-01-15T00:00:00Z").getTime() / 1000);
const SECONDS_PER_DAY = 86_400;
const db = createDb(env.DB);

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM alert_claims").run();
  await env.DB.prepare("DELETE FROM notification_log").run();
});

describe("claimAlert", () => {
  it("atomically gives one concurrent delivery the fresh claim", async () => {
    const claims = await Promise.all([claimAlert(db, WALLET, "warning", NOW), claimAlert(db, WALLET, "warning", NOW)]);
    expect(claims.sort()).toEqual(["claimed", "pending"]);
  });

  it("allows escalation but suppresses de-escalation and an early repeat", async () => {
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
    await recordSent(db, {
      tier: "warning",
      wallet: WALLET,
      fundedUntilSec: NOW + SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });
    expect(await claimAlert(db, WALLET, "warning", NOW + SECONDS_PER_DAY)).toBe("suppressed");
    expect(await claimAlert(db, WALLET, "critical", NOW + SECONDS_PER_DAY)).toBe("claimed");
    await recordSent(db, {
      tier: "critical",
      wallet: WALLET,
      fundedUntilSec: NOW + SECONDS_PER_DAY,
      sentAtSec: NOW + SECONDS_PER_DAY,
      emailSentTo: "alice@example.com",
    });
    expect(await claimAlert(db, WALLET, "warning", NOW + 2 * SECONDS_PER_DAY)).toBe("suppressed");
  });

  it("allows a same-tier alert after its window", async () => {
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
    await recordSent(db, {
      tier: "warning",
      wallet: WALLET,
      fundedUntilSec: NOW + SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });
    expect(await claimAlert(db, WALLET, "warning", NOW + RE_ALERT_WINDOWS.warning * SECONDS_PER_DAY)).toBe("claimed");
  });

  it("reclaims an interrupted delivery after its lease", async () => {
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
    expect(await claimAlert(db, WALLET, "critical", NOW + 1)).toBe("pending");
    expect(await claimAlert(db, WALLET, "warning", NOW + CLAIM_LEASE_SECONDS - 1)).toBe("pending");
    expect(await claimAlert(db, WALLET, "critical", NOW + CLAIM_LEASE_SECONDS)).toBe("claimed");
  });

  it("can clear a recovered incident or release a failed delivery", async () => {
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
    await releaseAlertClaim(db, WALLET, "warning", NOW);
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
    await clearAlertClaim(db, WALLET);
    expect(await claimAlert(db, WALLET, "warning", NOW)).toBe("claimed");
  });
});

describe("recordSent", () => {
  it("marks the claim sent and writes the D1 audit row", async () => {
    expect(await claimAlert(db, WALLET, "critical", NOW)).toBe("claimed");
    await recordSent(db, {
      tier: "critical",
      wallet: WALLET,
      fundedUntilSec: NOW + 3 * SECONDS_PER_DAY,
      sentAtSec: NOW,
      emailSentTo: "alice@example.com",
    });

    const rows = await env.DB.prepare(
      "SELECT wallet_address, alert_level, funded_until, sent_at, email_sent_to FROM notification_log",
    ).all();
    expect(rows.results).toEqual([
      {
        wallet_address: WALLET,
        alert_level: "critical",
        funded_until: NOW + 3 * SECONDS_PER_DAY,
        sent_at: NOW,
        email_sent_to: "alice@example.com",
      },
    ]);
    expect(await claimAlert(db, WALLET, "critical", NOW + SECONDS_PER_DAY)).toBe("suppressed");
  });
});
