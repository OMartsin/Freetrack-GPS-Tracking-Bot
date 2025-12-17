import { Pool, PoolConfig } from 'pg';

const getDatabaseConfig = (): PoolConfig => {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
        return {
            connectionString: databaseUrl,
            ssl: false
        };
    } else {
        return {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'freetrack_gps',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres'
        };
    }
};

export const pool = new Pool(getDatabaseConfig());

pool.on('connect', () => {
    console.log('Database connection established');
});

pool.on('error', (err: Error) => {
    console.error('Unexpected database error:', err);
});

async function queryWithRetry<T = any>(text: string, params?: any[], retries = 3): Promise<T[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(text, params);
            return result.rows;
        } catch (error: any) {
            if (client) {
                client.release(true);
            }
            
            const isConnectionError = error.code === 'ETIMEDOUT' || 
                                     error.code === 'ECONNREFUSED' || 
                                     error.code === 'ECONNRESET';
            
            const isDatabaseStarting = error.message?.includes('starting up') ||
                                      error.message?.includes('not accept connections') ||
                                      error.message?.includes('shutting down');
            
            if ((isConnectionError || isDatabaseStarting) && attempt < retries) {
                console.log(`[DB] ${isDatabaseStarting ? 'Database restarting' : 'Connection error'}, retrying (${attempt}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                continue;
            }
            
            throw error;
        } finally {
            if (client) {
                client.release();
            }
        }
    }
    throw new Error('Max retries reached');
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    return queryWithRetry<T>(text, params);
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

export async function closePool(): Promise<void> {
    await pool.end();
}

