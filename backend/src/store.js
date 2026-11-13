import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const databasePath = process.env.DATABASE_PATH || fileURLToPath(new URL("../data/nfc-pos.sqlite", import.meta.url));
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS stripe_test_transactions (
    session_id TEXT PRIMARY KEY,
    amount_bani INTEGER NOT NULL CHECK (amount_bani > 0),
    currency TEXT NOT NULL CHECK (currency = 'ron'),
    created_at TEXT NOT NULL,
    livemode INTEGER NOT NULL CHECK (livemode = 0)
  );
  CREATE TABLE IF NOT EXISTS processed_webhook_events (
    event_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL
  );
`);

const insertEvent = database.prepare(`
  INSERT OR IGNORE INTO processed_webhook_events (event_id, processed_at)
  VALUES (@eventId, @processedAt)
`);
const insertTransaction = database.prepare(`
  INSERT OR IGNORE INTO stripe_test_transactions (session_id, amount_bani, currency, created_at, livemode)
  VALUES (@sessionId, @amountBani, @currency, @createdAt, 0)
`);
const recordTransaction = database.transaction((event, transaction) => {
  const inserted = insertEvent.run({ eventId: event.id, processedAt: new Date().toISOString() });
  if (inserted.changes === 0) return;
  insertTransaction.run(transaction);
});

export function recordPaidTestCheckout(event, session) {
  if (
    session.livemode !== false
    || session.id?.startsWith("cs_test_") !== true
    || session.mode !== "payment"
    || session.currency?.toLowerCase() !== "ron"
    || session.metadata?.source !== "nfc-pos-demo"
    || session.payment_status !== "paid"
  ) return;
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total <= 0) return;
  recordTransaction(event, {
    sessionId: session.id,
    amountBani: session.amount_total,
    currency: String(session.currency || "").toLowerCase(),
    createdAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString()
  });
}

export function findTestCheckout(sessionId) {
  return database.prepare(`
    SELECT session_id AS sessionId, amount_bani AS amountBani, currency,
      created_at AS createdAt, livemode
    FROM stripe_test_transactions WHERE session_id = ?
  `).get(sessionId);
}

export function listTestTransactions() {
  return database.prepare(`
    SELECT session_id AS sessionId, amount_bani AS amountBani, currency, created_at AS createdAt
    FROM stripe_test_transactions ORDER BY created_at DESC LIMIT 100
  `).all();
}
