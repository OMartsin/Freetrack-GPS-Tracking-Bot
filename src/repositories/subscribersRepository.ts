import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '../dbs');
const DB_PATH = path.join(DB_DIR, 'subscribers.db');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

export async function initDb() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      chat_id INTEGER PRIMARY KEY,
      is_authenticated INTEGER DEFAULT 0,
      awaiting_password INTEGER DEFAULT 0,
      subscribed_at INTEGER,
      last_activity INTEGER
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      device_id TEXT,
      alert_type TEXT,
      last_sent INTEGER,
      PRIMARY KEY (device_id, alert_type)
    )
  `);
}

export async function isAuthenticated(chatId: number): Promise<boolean> {
    const result = db.prepare('SELECT is_authenticated FROM subscribers WHERE chat_id = ?').get(chatId) as any;
    return result?.is_authenticated === 1;
}

export async function isAwaitingPassword(chatId: number): Promise<boolean> {
    const result = db.prepare('SELECT awaiting_password FROM subscribers WHERE chat_id = ?').get(chatId) as any;
    return result?.awaiting_password === 1;
}

export async function setAwaitingPassword(chatId: number, awaiting: boolean) {
    const stmt = db.prepare(`
        INSERT INTO subscribers (chat_id, awaiting_password, last_activity) 
        VALUES (?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET 
          awaiting_password = ?,
          last_activity = ?
    `);
    
    const timestamp = Math.floor(Date.now() / 1000);
    const awaitingValue = awaiting ? 1 : 0;
    stmt.run(chatId, awaitingValue, timestamp, awaitingValue, timestamp);
}

export async function authenticateUser(chatId: number) {
    const stmt = db.prepare(`
        INSERT INTO subscribers (chat_id, is_authenticated, awaiting_password, subscribed_at, last_activity) 
        VALUES (?, 1, 0, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET 
          is_authenticated = 1,
          awaiting_password = 0,
          subscribed_at = ?,
          last_activity = ?
    `);
    
    const timestamp = Math.floor(Date.now() / 1000);
    stmt.run(chatId, timestamp, timestamp, timestamp, timestamp);
}

export async function removeSubscriber(chatId: number) {
    db.prepare('DELETE FROM subscribers WHERE chat_id = ?').run(chatId);
}

export async function getAllAuthenticatedSubscribers(): Promise<{ chat_id: number }[]> {
    const result = db.prepare('SELECT chat_id FROM subscribers WHERE is_authenticated = 1').all();
    return result as { chat_id: number }[];
}

export async function shouldSendAlert(deviceId: string, alertType: string): Promise<boolean> {
    const result = db.prepare('SELECT last_sent FROM alerts WHERE device_id = ? AND alert_type = ?')
        .get(deviceId, alertType) as any;

    if (!result) return true;

    const hoursSinceLastAlert = (Date.now() / 1000 - result.last_sent) / 3600;

    return hoursSinceLastAlert >= 0.5; // Only alert once per 0.5 hours
}

export async function recordAlert(deviceId: string, alertType: string) {
    db.prepare('INSERT OR REPLACE INTO alerts (device_id, alert_type, last_sent) VALUES (?, ?, ?)')
        .run(deviceId, alertType, Math.floor(Date.now() / 1000));
}

export async function cleanupStaleRequests() {
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 3600);
    db.prepare('DELETE FROM subscribers WHERE awaiting_password = 1 AND is_authenticated = 0 AND last_activity < ?')
        .run(oneDayAgo);
}

export function closeDb() {
    db.close();
}
