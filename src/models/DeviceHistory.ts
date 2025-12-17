export interface DeviceHistory {
    id: number;
    device_id: string;
    last_update: Date;
    gps_signal: number | null;
    latitude: number | null;
    longitude: number | null;
    speed: number | null;
    ignition: boolean | null;
    has_data: boolean;
    checked_at: Date;
    created_at: Date;
}

export interface CreateDeviceHistoryDto {
    device_id: string;
    last_update: Date | null;
    gps_signal: number | null;
    latitude: number | null;
    longitude: number | null;
    speed: number | null;
    ignition: boolean | null;
    has_data: boolean;
    checked_at: Date;
}

export interface DeviceStatusResponse {
    lastUpdate: Date | null;
    gpsSignal: number | null;
    location: { lat: number; long: number } | null;
    speed: number | null;
    ignition: boolean | null;
    hasData: boolean;
    checkedAt: Date;
}

