import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import axios from 'axios';
import {
    isAuthenticated,
    isAwaitingPassword,
    setAwaitingPassword,
    authenticateUser,
    removeSubscriber,
    getAllAuthenticatedSubscribers,
    cleanupStaleRequests
} from './repositories/subscribersRepository';
import {
    shouldSendAlert,
    recordAlert
} from './repositories/alertsRepository';
import {
    saveDeviceHistory,
    saveDeviceHistoryBatch,
    getLatestDeviceStatus,
    getLastKnownLocation,
    cleanupOldHistory
} from './repositories/deviceHistoryRepository';

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

function formatDateTime(date: Date, languageCode?: string): string {
    const locale = languageCode || 'uk-UA';
    const timeZone = 'Europe/Kyiv'; // Default to Kyiv time
    
    return date.toLocaleString(locale, { 
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

bot.on('polling_error', (error: any) => {
    logError('[Telegram Polling Error]:', (error as any).code, (error as any).message);
});

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
    const userLang = msg.from?.language_code;

    try {
        const authenticated = await isAuthenticated(chatId);

        if (!authenticated) {
            bot.sendMessage(
                chatId,
                '❌ Доступ заборонено. Спочатку підпишіться за допомогою /start.'
            );
            return;
        }

        const status = await getLatestDeviceStatus(DEVICE_ID);

        if (!status) {
            bot.sendMessage(
                chatId,
                `📊 Статус пристрою (${DEVICE_ID})\n\n` +
                '❌ Немає даних. Зачекайте першої перевірки.'
            );
            return;
        }

        if (!status.hasData) {
            let message = `📊 Статус пристрою (${DEVICE_ID})\n\n` +
                '❌ Пристрій не надсилав даних протягом останніх 15 хвилин\n\n';
            
            const lastKnown = await getLastKnownLocation(DEVICE_ID);
            if (lastKnown) {
                const mapsLink = `https://www.google.com/maps?q=${lastKnown.latitude},${lastKnown.longitude}`;
                message += `⏱ Остання локація: ${formatDateTime(lastKnown.lastUpdate, userLang)}\n` +
                    `📍 ${lastKnown.latitude.toFixed(6)}, ${lastKnown.longitude.toFixed(6)}\n` +
                    `🗺 <a href="${mapsLink}">Відкрити на карті</a>\n\n`;
            }
            
            message += `🔗 <a href="https://gps.freetrack.com.ua/?auth_token=${FREETRACK_TOKEN}">Перевірити пристрій</a>`;
            
            bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            return;
        }

        let message = `📊 Статус пристрою (${DEVICE_ID})\n\n` +
            `⏱ Оновлено: ${formatDateTime(status.lastUpdate!, userLang)}\n` +
            `📡 GPS: ${status.gpsSignal ?? 'N/A'} ${status.gpsSignal && status.gpsSignal < 10 ? '(слабкий)' : '(нормальний)'}` + '\n';
        
        if (status.location) {
            const mapsLink = `https://www.google.com/maps?q=${status.location.lat},${status.location.long}`;
            message += `📍 ${status.location.lat.toFixed(6)}, ${status.location.long.toFixed(6)}\n` +
                `🗺 <a href="${mapsLink}">Відкрити на карті</a>\n`;
        } else {
            message += `📍 Локація: Недоступна\n`;
        }
        
        message += `🚗 Швидкість: ${status.speed ?? 0} км/год\n` +
            `🔑 Запалювання: ${status.ignition ? 'увімкнено' : 'вимкнено'}`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error: any) {
        logError('Error in /status:', error.message || 'Unknown error');
        bot.sendMessage(chatId, '❌ Помилка отримання статусу пристрою. Спробуйте ще раз.');
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

async function fetchAndSaveDeviceData(): Promise<{ savedCount: number; hasRecentData: boolean }> {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - (1 * 60 * 60);
    const fifteenMinutesAgo = now - (15 * 60);

    const url = `https://gpsapi.freetrack.ua/api/`;
    const params = {
        auth_token: FREETRACK_TOKEN,
        api_type: 'reports',
        api_name: 'device-trace',
        id: DEVICE_ID,
        dateFrom: oneHourAgo,
        dateTo: now
    };

    try {
        const response = await axios.get(url, { params, timeout: 10000 });

        if (response.data.result !== 'ok') {
            throw new Error('API error: ' + JSON.stringify(response.data));
        }

        const deviceData = response.data.response.find((d: any) => d.id === parseInt(DEVICE_ID));

        if (!deviceData || deviceData.points.length === 0) {
            log('[FETCH] No data points received from API');
            return { savedCount: 0, hasRecentData: false };
        }

        const points: DevicePoint[] = deviceData.points;
        log(`[FETCH] Received ${points.length} GPS points from API`);

        // Prepare batch data (filter out invalid coordinates)
        const validPoints = points.filter(point => point.lat && point.long);
        const skippedCount = points.length - validPoints.length;
        
        const batchData = validPoints.map(point => ({
            device_id: DEVICE_ID,
            last_update: new Date(point.time * 1000),
            gps_signal: point.gps,
            latitude: point.lat,
            longitude: point.long,
            speed: point.speed,
            ignition: point.ignition === 1,
            has_data: true,
            checked_at: new Date(point.time * 1000)
        }));

        let savedCount = 0;
        try {
            savedCount = await saveDeviceHistoryBatch(batchData);
            const duplicateCount = batchData.length - savedCount;
            log(`[FETCH] Saved ${savedCount} new GPS points (${duplicateCount} duplicates, ${skippedCount} invalid coordinates skipped)`);
        } catch (error: any) {
            logError('[FETCH] Batch save failed, error:', error.message || error);
        }

        const latestPoint = points[points.length - 1];
        const hasRecentData = latestPoint.time >= fifteenMinutesAgo;

        return { savedCount, hasRecentData };
    } catch (error: any) {
        const errorMsg = error.response 
            ? `API error: ${error.response.status} - ${error.response.statusText}`
            : error.message || 'Unknown error';
        logError('[FETCH] Error fetching device data:', errorMsg);
        throw error;
    }
}

async function performCheck() {
    log('[CHECK] Starting GPS check...');

    try {
        await fetchAndSaveDeviceData();
        
        const status = await getLatestDeviceStatus(DEVICE_ID);
        
        // check if the last update is within the last 15 minutes
        const hasRecentData = status && status.hasData && 
            status.lastUpdate && 
            (new Date().getTime() - status.lastUpdate.getTime()) < 15 * 60 * 1000;

        if (!hasRecentData) {
            log('[CHECK] No data received in last 15 minutes');
            
            const lastKnown = await getLastKnownLocation(DEVICE_ID);
            
            if (await shouldSendAlert(DEVICE_ID, 'no_data')) {
                let message = `🚨 <b>ПОМИЛКА: Немає даних</b>\n\n` +
                    `Пристрій ${DEVICE_ID} не надсилав даних протягом останніх 15 хвилин!\n\n`;
                
                if (lastKnown) {
                    const mapsLink = `https://www.google.com/maps?q=${lastKnown.latitude},${lastKnown.longitude}`;
                    message += `⏱ Остання локація: ${formatDateTime(lastKnown.lastUpdate)}\n` +
                        `📍 ${lastKnown.latitude.toFixed(6)}, ${lastKnown.longitude.toFixed(6)}\n` +
                        `🗺 <a href="${mapsLink}">Відкрити на карті</a>\n\n`;
                }
                
                message += `🔗 <a href="https://gps.freetrack.com.ua/?auth_token=${FREETRACK_TOKEN}">Перевірити пристрій</a>`;
                
                await sendAlertToSubscribers(message);
                await recordAlert(DEVICE_ID, 'no_data');
                log('[ALERT] No data alert sent');
            }
            return;
        }

        const lastUpdateTime = status.lastUpdate!.toISOString();
        const locationStr = status.location 
            ? `${status.location.lat.toFixed(6)}, ${status.location.long.toFixed(6)}`
            : 'N/A';
        log(
            `[CHECK] ✅ GPS Status OK - ` +
            `Signal: ${status.gpsSignal ?? 'N/A'} sats, ` +
            `Speed: ${status.speed ?? 0} km/h, ` +
            `Ignition: ${status.ignition ? 'ON' : 'OFF'}, ` +
            `Location: ${locationStr}, ` +
            `Last update: ${lastUpdateTime}`
        );

        if (status.gpsSignal !== null && status.gpsSignal < 10) {
            if (await shouldSendAlert(DEVICE_ID, 'low_gps')) {
                let alertMessage = `⚠️ <b>УВАГА: Слабкий GPS сигнал</b>\n\n` +
                    `Пристрій ${DEVICE_ID} має слабкий GPS сигнал!\n\n` +
                    `⏱ Час: ${formatDateTime(status.lastUpdate!)}\n` +
                    `📡 GPS: ${status.gpsSignal} супутників (слабкий)\n`;
                
                if (status.location) {
                    const mapsLink = `https://www.google.com/maps?q=${status.location.lat},${status.location.long}`;
                    alertMessage += `📍 ${status.location.lat.toFixed(6)}, ${status.location.long.toFixed(6)}\n` +
                        `🗺 <a href="${mapsLink}">Відкрити на карті</a>\n`;
                }
                
                alertMessage += `🚗 Швидкість: ${status.speed ?? 0} км/год`;
                
                await sendAlertToSubscribers(alertMessage);
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
    log('✅ Telegram bot started');

    cron.schedule(CHECK_INTERVAL, performCheck);
    log(`✅ Cron job scheduled: ${CHECK_INTERVAL}`);

    cron.schedule('0 0 * * *', async () => {
        log('[CLEANUP] Running daily cleanup...');
        await cleanupStaleRequests();
        log('[CLEANUP] Stale requests cleaned up');
    });

    cron.schedule('0 0 * * *', async () => {
        log('[CLEANUP] Cleaning up old device history...');
        const deletedCount = await cleanupOldHistory(7);
        log(`[CLEANUP] Deleted ${deletedCount} old device history records`);
    });

    await performCheck();
}

start().catch(logError);
