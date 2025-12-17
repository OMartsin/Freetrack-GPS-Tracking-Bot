export interface Subscriber {
    chat_id: number;
    is_authenticated: boolean;
    awaiting_password: boolean;
    subscribed_at: Date | null;
    last_activity: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateSubscriberDto {
    chat_id: number;
    is_authenticated?: boolean;
    awaiting_password?: boolean;
    subscribed_at?: Date;
    last_activity?: Date;
}

export interface UpdateSubscriberDto {
    is_authenticated?: boolean;
    awaiting_password?: boolean;
    subscribed_at?: Date;
    last_activity?: Date;
}

