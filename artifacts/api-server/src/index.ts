import app from "./app";
import { logger } from "./lib/logger";
import { db, keysTable } from "@workspace/db";
import { sql, count } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const SEED_KEYS = [
  { key: "sk-XIAOJIBAOBAO-bMBb13", tier: 1, tierName: "一等奖" },
  { key: "sk-XIAOJIBAOBAO-KNiVo0", tier: 2, tierName: "二等奖" },
  { key: "sk-XIAOJIBAOBAO-clbOIw", tier: 2, tierName: "二等奖" },
  { key: "sk-XIAOJIBAOBAO-vHu62X", tier: 2, tierName: "二等奖" },
  { key: "sk-XIAOJIBAOBAO-24z6UP", tier: 2, tierName: "二等奖" },
  { key: "sk-XIAOJIBAOBAO-6NHezD", tier: 2, tierName: "二等奖" },
  { key: "sk-XIAOJIBAOBAO-eRIt4r", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-wm9Ow8", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-pC2pC8", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-vVfXkq", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-Ba7YCG", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-0M7Vay", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-ZqzOGw", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-42CcPz", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-Sg34eg", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-x7TR6C", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-FAC4iP", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-fywjat", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-uojqlJ", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-UbKyEo", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-WCQW73", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-z8bQvz", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-m8EjRF", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-ai2WJT", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-PjL9dx", tier: 3, tierName: "三等奖" },
  { key: "sk-XIAOJIBAOBAO-fmluo5", tier: 3, tierName: "三等奖" },
];

async function initDb() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS keys (
      id serial PRIMARY KEY,
      key text NOT NULL UNIQUE,
      tier integer NOT NULL,
      tier_name text NOT NULL,
      claimed boolean NOT NULL DEFAULT false,
      claimed_at timestamptz,
      claimed_by_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const [{ value: total }] = await db.select({ value: count() }).from(keysTable);
  if (total === 0) {
    await db.insert(keysTable).values(
      SEED_KEYS.map((k) => ({ key: k.key, tier: k.tier, tierName: k.tierName, claimed: false }))
    ).onConflictDoNothing();
    logger.info({ count: SEED_KEYS.length }, "Seeded keys table");
  }
}

initDb()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize database");
    process.exit(1);
  });
