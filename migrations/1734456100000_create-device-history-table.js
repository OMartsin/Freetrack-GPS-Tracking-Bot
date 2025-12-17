/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
    pgm.createTable('device_history', {
        id: {
            type: 'serial',
            primaryKey: true
        },
        device_id: {
            type: 'varchar(100)',
            notNull: true
        },
        last_update: {
            type: 'timestamp',
            notNull: false,
            comment: 'Timestamp from the device when it last sent data'
        },
        gps_signal: {
            type: 'integer',
            notNull: false,
            comment: 'Number of GPS satellites'
        },
        latitude: {
            type: 'decimal(10, 6)',
            notNull: false
        },
        longitude: {
            type: 'decimal(10, 6)',
            notNull: false
        },
        speed: {
            type: 'integer',
            notNull: false,
            comment: 'Speed in km/h'
        },
        ignition: {
            type: 'boolean',
            notNull: false,
            comment: 'Ignition status'
        },
        has_data: {
            type: 'boolean',
            notNull: true,
            default: false,
            comment: 'Whether device sent data in the last 15 minutes'
        },
        checked_at: {
            type: 'timestamp',
            notNull: true,
            comment: 'When this check was performed'
        },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp')
        }
    });

    pgm.createIndex('device_history', 'device_id');
    pgm.createIndex('device_history', 'checked_at');
    pgm.createIndex('device_history', ['device_id', 'checked_at']);

    pgm.createIndex('device_history', 'created_at');
};

exports.down = (pgm) => {
    pgm.dropTable('device_history');
};

