export interface Alert {
    id: number;
    device_id: string;
    alert_type: string;
    last_sent: Date;
    created_at: Date;
    updated_at: Date;
}

export interface CreateAlertDto {
    device_id: string;
    alert_type: string;
    last_sent: Date;
}

export interface UpdateAlertDto {
    last_sent: Date;
}

