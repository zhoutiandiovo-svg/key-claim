import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const keysTable = pgTable("keys", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  tier: integer("tier").notNull(),
  tierName: text("tier_name").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByIp: text("claimed_by_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKeySchema = createInsertSchema(keysTable).omit({ id: true, createdAt: true, claimedAt: true });
export type InsertKey = z.infer<typeof insertKeySchema>;
export type Key = typeof keysTable.$inferSelect;
