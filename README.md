# Freetrack GPS Alerts Bot

A Telegram bot that monitors GPS devices via Freetrack API and sends alerts when issues are detected.

## Features

- 🔐 Password-protected subscription system
- 📍 Real-time GPS monitoring
- 🚨 Automatic alerts for:
  - No data received (15+ minutes)
  - Weak GPS signal (< 10 satellites)
- ⏰ Configurable check intervals
- 📊 Device status commands

## Requirements

- Node.js 18+ 
- Telegram Bot Token
- Freetrack API Token

## Environment Variables

Create a `.env` file with:

```env
TELEGRAM_TOKEN=your_telegram_bot_token
FREETRACK_TOKEN=your_freetrack_api_token
DEVICE_ID=your_device_id
AUTH_PASSWORD=your_subscription_password
```

## Installation

```bash
npm install
npm run build
npm start
```

## Development

```bash
npm run dev
```

## Deployment

### Railway / Render

1. Connect your repository
2. Add environment variables
3. Deploy automatically

The app uses `better-sqlite3` for fast, reliable database operations with minimal build time.

## Commands

- `/start` - Subscribe to alerts (requires password)
- `/status` - Check current device status
- `/stop` - Unsubscribe from alerts

