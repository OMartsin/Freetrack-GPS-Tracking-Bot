import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

const DB_PATH = path.join(__dirname, '../dbs/subscribers.db');

const db = new sqlite3.Database(DB_PATH);
const dbRun = promisify(db.run.bind(db)) as (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;
const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;

export async function initDb() {
    await dbRun(`
    CREATE TABLE IF NOT EXISTS subscribers (
      chat_id INTEGER PRIMARY KEY,
      is_authenticated INTEGER DEFAULT 0,
      awaiting_password INTEGER DEFAULT 0,
      subscribed_at INTEGER,
      last_activity INTEGER
    )
  `);

    await dbRun(`
    CREATE TABLE IF NOT EXISTS alerts (
      device_id TEXT,
      alert_type TEXT,
      last_sent INTEGER,
      PRIMARY KEY (device_id, alert_type)
    )
  `);
}

export async function isAuthenticated(chatId: number): Promise<boolean> {
    const result: any = await dbGet(
        'SELECT is_authenticated FROM subscribers WHERE chat_id = ?',
        [chatId]
    );
    return result?.is_authenticated === 1;
}

export async function isAwaitingPassword(chatId: number): Promise<boolean> {
    const result: any = await dbGet(
        'SELECT awaiting_password FROM subscribers WHERE chat_id = ?',
        [chatId]
    );
    return result?.awaiting_password === 1;
}

export async function setAwaitingPassword(chatId: number, awaiting: boolean) {
    await dbRun(
        `INSERT INTO subscribers (chat_id, awaiting_password, last_activity) 
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET 
       awaiting_password = ?,
       last_activity = ?`,
        [chatId, awaiting ? 1 : 0, Math.floor(Date.now() / 1000), awaiting ? 1 : 0, Math.floor(Date.now() / 1000)]
    );
}

export async function authenticateUser(chatId: number) {
    await dbRun(
        `INSERT INTO subscribers (chat_id, is_authenticated, awaiting_password, subscribed_at, last_activity) 
     VALUES (?, 1, 0, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET 
       is_authenticated = 1,
       awaiting_password = 0,
       subscribed_at = ?,
       last_activity = ?`,
        [
            chatId,
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000)
        ]
    );
}

export async function removeSubscriber(chatId: number) {
    await dbRun('DELETE FROM subscribers WHERE chat_id = ?', [chatId]);
}

export async function getAllAuthenticatedSubscribers(): Promise<{ chat_id: number }[]> {
    const result = await dbAll(
        'SELECT chat_id FROM subscribers WHERE is_authenticated = 1'
    );
    return result as { chat_id: number }[];
}

export async function shouldSendAlert(deviceId: string, alertType: string): Promise<boolean> {
    const result: any = await dbGet(
        'SELECT last_sent FROM alerts WHERE device_id = ? AND alert_type = ?',
        [deviceId, alertType]
    );

    if (!result) return true;

    const hoursSinceLastAlert = (Date.now() / 1000 - result.last_sent) / 3600;

    return hoursSinceLastAlert >= 0.5; // Only alert once per 0.5 hours
}

export async function recordAlert(deviceId: string, alertType: string) {
    await dbRun(
        'INSERT OR REPLACE INTO alerts (device_id, alert_type, last_sent) VALUES (?, ?, ?)',
        [deviceId, alertType, Math.floor(Date.now() / 1000)]
    );
}

export async function cleanupStaleRequests() {
    const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 3600);
    await dbRun(
        'DELETE FROM subscribers WHERE awaiting_password = 1 AND is_authenticated = 0 AND last_activity < ?',
        [oneDayAgo]
    );
}

export function closeDb() {
    db.close();
}

