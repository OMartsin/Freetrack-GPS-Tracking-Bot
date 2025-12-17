/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
    pgm.createTable('subscribers', {
        chat_id: {
            type: 'bigint',
            primaryKey: true,
            notNull: true
        },
        is_authenticated: {
            type: 'boolean',
            notNull: true,
            default: false
        },
        awaiting_password: {
            type: 'boolean',
            notNull: true,
            default: false
        },
        subscribed_at: {
            type: 'timestamp',
            notNull: false
        },
        last_activity: {
            type: 'timestamp',
            notNull: false
        },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        },
        updated_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        }
    });

    pgm.createIndex('subscribers', 'is_authenticated');

    pgm.createTable('alerts', {
        id: {
            type: 'serial',
            primaryKey: true
        },
        device_id: {
            type: 'varchar(100)',
            notNull: true
        },
        alert_type: {
            type: 'varchar(50)',
            notNull: true
        },
        last_sent: {
            type: 'timestamp',
            notNull: true
        },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        },
        updated_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        }
    });

    pgm.createConstraint('alerts', 'alerts_device_alert_unique', {
        unique: ['device_id', 'alert_type']
    });

    pgm.createIndex('alerts', ['device_id', 'alert_type']);
};

exports.down = (pgm) => {
    pgm.dropTable('alerts');
    pgm.dropTable('subscribers');
};

