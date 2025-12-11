import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import axios from 'axios';
import {
    initDb,
    isAuthenticated,
    isAwaitingPassword,
    setAwaitingPassword,
    authenticateUser,
    removeSubscriber,
    getAllAuthenticatedSubscribers,
    shouldSendAlert,
    recordAlert,
    cleanupStaleRequests
} from './repositories/subscribersRepository';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!;
const FREETRACK_TOKEN = process.env.FREETRACK_TOKEN!;
const DEVICE_ID = process.env.DEVICE_ID!;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD!;
const CHECK_INTERVAL = '*/7 * * * *'; // Every 7 minutes

function getUTCTimestamp(): string {
    return new Date().toISOString();
}

function log(...args: any[]) {
    console.log(`[${getUTCTimestamp()}]`, ...args);
}

function logError(...args: any[]) {
    console.error(`[${getUTCTimestamp()}]`, ...args);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const authenticated = await isAuthenticated(chatId);

        if (authenticated) {
            bot.sendMessage(
                chatId,
                '✅ Ви вже підписані на GPS сповіщення!\n\n' +
                `Моніторинг пристрою: ${DEVICE_ID}\n\n` +
                'Команди:\n' +
                '/status - Перевірити статус пристрою\n' +
                '/stop - Відписатися'
            );
            return;
        }

        await setAwaitingPassword(chatId, true);

        bot.sendMessage(
            chatId,
            '🔐 Ласкаво просимо до GPS Monitor Bot!\n\n' +
            'Для підписки на сповіщення, будь ласка, введіть пароль:'
        );
    } catch (error: any) {
        logError('Error in /start:', error.message || 'Unknown error');
        bot.sendMessage(chatId, '❌ Помилка обробки запиту. Спробуйте ще раз.');
    }
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const authenticated = await isAuthenticated(chatId);

        if (!authenticated) {
            bot.sendMessage(chatId, '❌ Ви не підписані.');
            return;
        }

        await removeSubscriber(chatId);
        bot.sendMessage(
            chatId,
            '👋 Ви відписалися від GPS сповіщень.\n\n' +
            'Використайте /start для повторної підписки.'
        );
    } catch (error: any) {
        logError('Error in /stop:', error.message || 'Unknown error');
        bot.sendMessage(chatId, '❌ Помилка обробки запиту. Спробуйте ще раз.');
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const authenticated = await isAuthenticated(chatId);

        if (!authenticated) {
            bot.sendMessage(
                chatId,
                '❌ Доступ заборонено. Спочатку підпишіться за допомогою /start.'
            );
            return;
        }

        const status = await checkDeviceStatus();

        if (!status.hasData) {
            bot.sendMessage(
                chatId,
                `📊 Device Status (${DEVICE_ID})\n\n` +
                '❌ No data received in the last 15 minutes'
            );
            return;
        }

        bot.sendMessage(
            chatId,
            `📊 Статус пристрою (${DEVICE_ID})\n\n` +
            `Останнє оновлення: ${new Date(status.lastUpdate! * 1000).toLocaleString('uk-UA')}\n` +
            `GPS сигнал: ${status.gpsSignal} ${status.gpsSignal! < 10 ? '(слабкий)' : '(нормальний)'}` + '\n' +
            `Локація: ${status.location!.lat.toFixed(6)}, ${status.location!.long.toFixed(6)}\n` +
            `Швидкість: ${status.speed} км/год\n` +
            `Запалювання: ${status.ignition ? 'вимкнено' : 'увімкнено'}`
        );
    } catch (error: any) {
        logError('Error in /status:', error.message || 'Unknown error');
        bot.sendMessage(chatId, '❌ Помилка отримання статусу пристрою. Перевірка статусу пристрою можлива раз у 5 хвилин. Спробуйте ще раз.');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    try {
        const awaitingPassword = await isAwaitingPassword(chatId);

        if (!awaitingPassword) return;

        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {
        }

        if (text.trim() === AUTH_PASSWORD) {
            await authenticateUser(chatId);

            bot.sendMessage(
                chatId,
                '✅ Автентифікація успішна!\n\n' +
                `Ви підписані на GPS сповіщення для пристрою ${DEVICE_ID}.\n\n` +
                'Ви отримаєте сповіщення, якщо:\n' +
                '• Пристрій припинить надсилати дані (15+ хв)\n' +
                '• GPS сигнал буде слабким (< 10 супутників)\n\n' +
                'Команди:\n' +
                '/status - Перевірити поточний статус пристрою\n' +
                '/stop - Відписатися від сповіщень'
            );
        } else {
            bot.sendMessage(
                chatId,
                '❌ Неправильний пароль. Спробуйте ще раз або використайте /start для перезапуску.'
            );
        }
    } catch (error: any) {
        logError('Error processing message:', error.message || 'Unknown error');
        bot.sendMessage(chatId, '❌ Помилка обробки запиту. Спробуйте ще раз.');
    }
});

interface DevicePoint {
    created_at: number;
    time: number;
    lat: number;
    long: number;
    speed: number;
    ignition: number;
    gps: number;
    sensors?: Record<string, string>;
}

interface DeviceStatus {
    lastUpdate: number | null;
    gpsSignal: number | null;
    location: { lat: number; long: number } | null;
    speed: number | null;
    ignition: boolean | null;
    hasData: boolean;
}

async function checkDeviceStatus(): Promise<DeviceStatus> {
    const now = Math.floor(Date.now() / 1000);
    const fifteenMinutesAgo = now - (15 * 60);

    const url = `https://gpsapi.freetrack.ua/api/`;
    const params = {
        auth_token: FREETRACK_TOKEN,
        api_type: 'reports',
        api_name: 'device-trace',
        id: DEVICE_ID,
        dateFrom: fifteenMinutesAgo,
        dateTo: now
    };

    try {
        const response = await axios.get(url, { params, timeout: 10000 });

        if (response.data.result !== 'ok') {
            throw new Error('API error: ' + JSON.stringify(response.data));
        }

        const deviceData = response.data.response.find((d: any) => d.id === parseInt(DEVICE_ID));

        if (!deviceData || deviceData.points.length === 0) {
            return {
                lastUpdate: null,
                gpsSignal: null,
                location: null,
                speed: null,
                ignition: null,
                hasData: false
            };
        }

        const latestPoint: DevicePoint = deviceData.points[deviceData.points.length - 1];

        return {
            lastUpdate: latestPoint.time,
            gpsSignal: latestPoint.gps,
            location: { lat: latestPoint.lat, long: latestPoint.long },
            speed: latestPoint.speed,
            ignition: latestPoint.ignition === 1,
            hasData: true
        };
    } catch (error: any) {
        const errorMsg = error.response 
            ? `API error: ${error.response.status} - ${error.response.statusText}`
            : error.message || 'Unknown error';
        logError('Error fetching device status:', errorMsg);
        throw error;
    }
}

async function sendAlertToSubscribers(message: string) {
    const subscribers = await getAllAuthenticatedSubscribers();

    log(`[ALERT] Sending to ${subscribers.length} subscribers`);

    for (const sub of subscribers) {
        try {
            await bot.sendMessage(sub.chat_id, message, { parse_mode: 'HTML' });
        } catch (error: any) {
            logError(`Failed to send to ${sub.chat_id}:`, error.message || 'Unknown error');
        }
    }
}

async function performCheck() {
    log('[CHECK] Starting GPS check...');

    try {
        const status = await checkDeviceStatus();

        if (!status.hasData) {
            log('[CHECK] No data received in last 15 minutes');
            if (await shouldSendAlert(DEVICE_ID, 'no_data')) {
                await sendAlertToSubscribers(
                    `🚨 <b>ПОМИЛКА: Немає даних</b>\n\n` +
                    `Пристрій ${DEVICE_ID} не надсилав даних протягом останніх 15 хвилин!\n\n` +
                    `Час: ${new Date().toLocaleString('uk-UA')}`
                );
                await recordAlert(DEVICE_ID, 'no_data');
                log('[ALERT] No data alert sent');
            }
            return;
        }

        const lastUpdateTime = new Date(status.lastUpdate! * 1000).toISOString();
        log(
            `[CHECK] ✅ GPS Status OK - ` +
            `Signal: ${status.gpsSignal} sats, ` +
            `Speed: ${status.speed} km/h, ` +
            `Ignition: ${status.ignition ? 'ON' : 'OFF'}, ` +
            `Location: ${status.location!.lat.toFixed(6)}, ${status.location!.long.toFixed(6)}, ` +
            `Last update: ${lastUpdateTime}`
        );

        if (status.gpsSignal !== null && status.gpsSignal < 10) {
            if (await shouldSendAlert(DEVICE_ID, 'low_gps')) {
                await sendAlertToSubscribers(
                    `⚠️ <b>УВАГА: Слабкий GPS сигнал</b>\n\n` +
                    `Пристрій ${DEVICE_ID} має слабкий GPS сигнал!\n\n` +
                    `Локація: ${status.location!.lat.toFixed(6)}, ${status.location!.long.toFixed(6)}\n` +
                    `GPS сигнал: ${status.gpsSignal} ${status.gpsSignal! < 10 ? '(слабкий)' : '(нормальний)'}` + '\n' +
                    `Швидкість: ${status.speed} км/год\n` +
                    `Час: ${new Date(status.lastUpdate! * 1000).toLocaleString('uk-UA')}`
                );
                await recordAlert(DEVICE_ID, 'low_gps');
                log('[ALERT] Low GPS alert sent');
            }
        }

        log('[CHECK] Check completed successfully');
    } catch (error) {
        logError('[ERROR] Check failed:', (error as Error).message || 'Unknown error');
    }
}

async function start() {
    await initDb();
    log('✅ Database initialized');

    log('✅ Telegram bot started');

    cron.schedule(CHECK_INTERVAL, performCheck);
    log(`✅ Cron job scheduled: ${CHECK_INTERVAL}`);

    cron.schedule('0 0 * * *', cleanupStaleRequests);

    await performCheck();
}

start().catch(logError);
