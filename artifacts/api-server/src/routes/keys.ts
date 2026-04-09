import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, keysTable } from "@workspace/db";
import { DrawKeyResponse, GetKeyStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

router.post("/keys/draw", async (req, res): Promise<void> => {
  const ip = getClientIp(req);

  const alreadyClaimed = await db
    .select()
    .from(keysTable)
    .where(and(eq(keysTable.claimed, true), eq(keysTable.claimedByIp, ip)));

  if (alreadyClaimed.length > 0) {
    const prev = alreadyClaimed[0];
    res.status(409).json({
      error: "您已经领取过密钥了",
      key: prev.key,
      tier: prev.tier,
      tierName: prev.tierName,
    });
    return;
  }

  const available = await db
    .select()
    .from(keysTable)
    .where(eq(keysTable.claimed, false));

  if (available.length === 0) {
    res.status(404).json({ error: "没有可用的密钥了" });
    return;
  }

  const randomIndex = Math.floor(Math.random() * available.length);
  const chosen = available[randomIndex];

  const [updated] = await db
    .update(keysTable)
    .set({ claimed: true, claimedAt: new Date(), claimedByIp: ip })
    .where(and(eq(keysTable.id, chosen.id), eq(keysTable.claimed, false)))
    .returning();

  if (!updated) {
    const retry = available.filter((k) => k.id !== chosen.id);
    if (retry.length === 0) {
      res.status(404).json({ error: "没有可用的密钥了" });
      return;
    }
    const retryIndex = Math.floor(Math.random() * retry.length);
    const retryChosen = retry[retryIndex];
    const [retryUpdated] = await db
      .update(keysTable)
      .set({ claimed: true, claimedAt: new Date(), claimedByIp: ip })
      .where(eq(keysTable.id, retryChosen.id))
      .returning();
    if (!retryUpdated) {
      res.status(404).json({ error: "没有可用的密钥了" });
      return;
    }
    const remaining = await db.select().from(keysTable).where(eq(keysTable.claimed, false));
    res.json(DrawKeyResponse.parse({ key: retryUpdated.key, tier: retryUpdated.tier, tierName: retryUpdated.tierName, remaining: remaining.length }));
    return;
  }

  const remaining = await db.select().from(keysTable).where(eq(keysTable.claimed, false));
  res.json(DrawKeyResponse.parse({ key: updated.key, tier: updated.tier, tierName: updated.tierName, remaining: remaining.length }));
});

router.get("/keys/stats", async (req, res): Promise<void> => {
  const all = await db.select().from(keysTable).where(eq(keysTable.claimed, false));
  const tier1 = all.filter((k) => k.tier === 1).length;
  const tier2 = all.filter((k) => k.tier === 2).length;
  const tier3 = all.filter((k) => k.tier === 3).length;
  res.json(GetKeyStatsResponse.parse({ tier1, tier2, tier3, total: all.length }));
});

export default router;
