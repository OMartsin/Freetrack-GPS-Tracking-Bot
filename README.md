# Freetrack GPS Alerts Bot

A Telegram bot that monitors GPS devices via Freetrack API and sends alerts when issues are detected.

## Features

- 🔐 Password-protected subscription system
- 📍 GPS monitoring every 7 minutes
- 🚨 Automatic alerts for:
  - No data received (15+ minutes)
  - Weak GPS signal (< 10 satellites)
- 📊 Device status history (stored in PostgreSQL)
- 📈 Status command reads from database (no API rate limits)
- 🗄️ Automatic cleanup of old data (7 days retention)
- ☁️ Production-ready PostgreSQL support

## Requirements

- Node.js 18+ 
- PostgreSQL 12+
- Telegram Bot Token
- Freetrack API Token

## Environment Variables

Create a `.env` file with:

```env
TELEGRAM_TOKEN=your_telegram_bot_token
FREETRACK_TOKEN=your_freetrack_api_token
DEVICE_ID=your_device_id
AUTH_PASSWORD=your_subscription_password

# Database (Railway/Heroku provides DATABASE_URL automatically)
DATABASE_URL=postgresql://user:password@host:port/database

# OR for local development:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=freetrack_gps
# DB_USER=postgres
# DB_PASSWORD=postgres
# DB_SSL=false
```

## Installation

```bash
npm install

# Run database migrations
npm run migrate:up

# Build and start
npm run build
npm start
```

## Development

```bash
npm run dev
```

## Deployment

### Railway

1. Create a new project on Railway
2. Add a PostgreSQL database service (Railway provides `DATABASE_URL` automatically)
3. Connect your GitHub repository
4. Add environment variables (TELEGRAM_TOKEN, FREETRACK_TOKEN, DEVICE_ID, AUTH_PASSWORD)
5. Run migrations: `railway run npm run migrate:up`
6. Deploy!

The app uses PostgreSQL for production-ready data storage with automatic history tracking and cleanup.

For detailed setup instructions, see [SETUP.md](./SETUP.md).

## Commands

- `/start` - Subscribe to alerts (requires password)
- `/status` - Check current device status (reads from database, no API rate limits)
- `/stop` - Unsubscribe from alerts

## How It Works

1. **GPS Monitoring**: Every 7 minutes, the bot checks the device status via Freetrack API
2. **History Storage**: Status is saved to PostgreSQL for historical tracking
3. **Status Command**: Users can check status anytime without hitting API rate limits
4. **Smart Alerts**: Alerts are sent only when issues are detected (with 30-minute cooldown)
5. **Auto Cleanup**: Old data (>7 days) is automatically cleaned up daily

