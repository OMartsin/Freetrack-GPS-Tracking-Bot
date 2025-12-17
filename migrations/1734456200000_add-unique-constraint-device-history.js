/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
    pgm.createConstraint('device_history', 'device_history_device_time_unique', {
        unique: ['device_id', 'last_update']
    });
};

exports.down = (pgm) => {
    pgm.dropConstraint('device_history', 'device_history_device_time_unique');
};

