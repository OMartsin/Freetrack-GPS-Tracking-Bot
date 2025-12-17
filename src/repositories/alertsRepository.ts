import { query, queryOne } from '../config/database';
import { Alert } from '../models/Alert';

export async function shouldSendAlert(deviceId: string, alertType: string): Promise<boolean> {
    const result = await queryOne<{ last_sent: Date }>(
        'SELECT last_sent FROM alerts WHERE device_id = $1 AND alert_type = $2',
        [deviceId, alertType]
    );

    if (!result) {
        return true;
    }

    const hoursSinceLastAlert = (Date.now() - result.last_sent.getTime()) / (1000 * 3600);
    return hoursSinceLastAlert >= 0.5; // Only alert once per 0.5 hours
}

export async function recordAlert(deviceId: string, alertType: string): Promise<void> {
    const now = new Date();
    
    await query(
        `INSERT INTO alerts (device_id, alert_type, last_sent) 
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT alerts_device_alert_unique
         DO UPDATE SET 
           last_sent = $3,
           updated_at = $3`,
        [deviceId, alertType, now]
    );
}

export async function getAlertsByDevice(deviceId: string): Promise<Alert[]> {
    return await query<Alert>(
        'SELECT * FROM alerts WHERE device_id = $1 ORDER BY last_sent DESC',
        [deviceId]
    );
}

export async function cleanupOldAlerts(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    await query(
        'DELETE FROM alerts WHERE last_sent < $1',
        [thirtyDaysAgo]
    );
}

