import { query, queryOne } from '../config/database';
import { DeviceHistory, CreateDeviceHistoryDto, DeviceStatusResponse } from '../models/DeviceHistory';


export async function saveDeviceHistory(data: CreateDeviceHistoryDto): Promise<DeviceHistory | null> {
    const result = await queryOne<DeviceHistory>(
        `INSERT INTO device_history 
         (device_id, last_update, gps_signal, latitude, longitude, speed, ignition, has_data, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT ON CONSTRAINT device_history_device_time_unique
         DO NOTHING
         RETURNING *`,
        [
            data.device_id,
            data.last_update,
            data.gps_signal,
            data.latitude,
            data.longitude,
            data.speed,
            data.ignition,
            data.has_data,
            data.checked_at
        ]
    );
    
    // Return null if duplicate (no rows returned due to ON CONFLICT DO NOTHING)
    return result;
}

export async function getLatestDeviceStatus(deviceId: string): Promise<DeviceStatusResponse | null> {
    const result = await queryOne<DeviceHistory>(
        `SELECT * FROM device_history 
         WHERE device_id = $1 
           AND last_update IS NOT NULL
         ORDER BY last_update DESC 
         LIMIT 1`,
        [deviceId]
    );

    if (!result) {
        return null;
    }

    const now = new Date();
    const lastUpdate = new Date(result.last_update);
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const hasData = lastUpdate >= fifteenMinutesAgo;

    return {
        lastUpdate: result.last_update,
        gpsSignal: result.gps_signal,
        location: result.latitude && result.longitude 
            ? { lat: Number(result.latitude), long: Number(result.longitude) }
            : null,
        speed: result.speed,
        ignition: result.ignition,
        hasData: hasData,
        checkedAt: result.checked_at
    };
}

export async function getDeviceHistory(
    deviceId: string, 
    startDate: Date, 
    endDate: Date
): Promise<DeviceHistory[]> {
    return await query<DeviceHistory>(
        `SELECT * FROM device_history 
         WHERE device_id = $1 
           AND checked_at >= $2 
           AND checked_at <= $3
         ORDER BY checked_at DESC`,
        [deviceId, startDate, endDate]
    );
}

export async function getLastKnownLocation(deviceId: string): Promise<{
    lastUpdate: Date;
    latitude: number;
    longitude: number;
} | null> {
    const result = await queryOne<{
        last_update: Date;
        latitude: number;
        longitude: number;
    }>(
        `SELECT last_update, latitude, longitude 
         FROM device_history 
         WHERE device_id = $1 
           AND has_data = true
           AND last_update IS NOT NULL
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
         ORDER BY last_update DESC 
         LIMIT 1`,
        [deviceId]
    );

    if (!result) {
        return null;
    }

    return {
        lastUpdate: result.last_update,
        latitude: Number(result.latitude),
        longitude: Number(result.longitude)
    };
}

export async function cleanupOldHistory(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const result = await query<{ count: number }>(
        `WITH deleted AS (
            DELETE FROM device_history 
            WHERE created_at < $1
            RETURNING *
         )
         SELECT COUNT(*) as count FROM deleted`,
        [cutoffDate]
    );
    
    return result[0]?.count || 0;
}

export async function getDeviceHistoryStats(deviceId: string, days: number = 7): Promise<{
    totalRecords: number;
    recordsWithData: number;
    recordsWithoutData: number;
    averageGpsSignal: number | null;
    oldestRecord: Date | null;
    newestRecord: Date | null;
}> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const result = await queryOne<{
        total_records: string;
        records_with_data: string;
        records_without_data: string;
        average_gps_signal: string | null;
        oldest_record: Date | null;
        newest_record: Date | null;
    }>(
        `SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN has_data = true THEN 1 ELSE 0 END) as records_with_data,
            SUM(CASE WHEN has_data = false THEN 1 ELSE 0 END) as records_without_data,
            AVG(gps_signal) as average_gps_signal,
            MIN(checked_at) as oldest_record,
            MAX(checked_at) as newest_record
         FROM device_history 
         WHERE device_id = $1 
           AND checked_at >= $2`,
        [deviceId, cutoffDate]
    );

    if (!result) {
        return {
            totalRecords: 0,
            recordsWithData: 0,
            recordsWithoutData: 0,
            averageGpsSignal: null,
            oldestRecord: null,
            newestRecord: null
        };
    }

    return {
        totalRecords: parseInt(result.total_records) || 0,
        recordsWithData: parseInt(result.records_with_data) || 0,
        recordsWithoutData: parseInt(result.records_without_data) || 0,
        averageGpsSignal: result.average_gps_signal ? parseFloat(result.average_gps_signal) : null,
        oldestRecord: result.oldest_record,
        newestRecord: result.newest_record
    };
}

