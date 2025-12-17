import { query, queryOne } from '../config/database';
import { Subscriber, CreateSubscriberDto, UpdateSubscriberDto } from '../models/Subscriber';

export async function isAuthenticated(chatId: number): Promise<boolean> {
    const result = await queryOne<{ is_authenticated: boolean }>(
        'SELECT is_authenticated FROM subscribers WHERE chat_id = $1',
        [chatId]
    );
    return result?.is_authenticated ?? false;
}

export async function isAwaitingPassword(chatId: number): Promise<boolean> {
    const result = await queryOne<{ awaiting_password: boolean }>(
        'SELECT awaiting_password FROM subscribers WHERE chat_id = $1',
        [chatId]
    );
    return result?.awaiting_password ?? false;
}

export async function setAwaitingPassword(chatId: number, awaiting: boolean): Promise<void> {
    const now = new Date();
    
    await query(
        `INSERT INTO subscribers (chat_id, awaiting_password, last_activity) 
         VALUES ($1, $2, $3)
         ON CONFLICT (chat_id) 
         DO UPDATE SET 
           awaiting_password = $2,
           last_activity = $3,
           updated_at = $3`,
        [chatId, awaiting, now]
    );
}

export async function authenticateUser(chatId: number): Promise<void> {
    const now = new Date();
    
    await query(
        `INSERT INTO subscribers (chat_id, is_authenticated, awaiting_password, subscribed_at, last_activity) 
         VALUES ($1, true, false, $2, $2)
         ON CONFLICT (chat_id) 
         DO UPDATE SET 
           is_authenticated = true,
           awaiting_password = false,
           subscribed_at = $2,
           last_activity = $2,
           updated_at = $2`,
        [chatId, now]
    );
}

export async function removeSubscriber(chatId: number): Promise<void> {
    await query('DELETE FROM subscribers WHERE chat_id = $1', [chatId]);
}

export async function getAllAuthenticatedSubscribers(): Promise<{ chat_id: number }[]> {
    return await query<{ chat_id: number }>(
        'SELECT chat_id FROM subscribers WHERE is_authenticated = true'
    );
}

export async function cleanupStaleRequests(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    await query(
        `DELETE FROM subscribers 
         WHERE awaiting_password = true 
           AND is_authenticated = false 
           AND last_activity < $1`,
        [oneDayAgo]
    );
}

