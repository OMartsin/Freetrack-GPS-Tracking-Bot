import { Pool, PoolConfig } from 'pg';

const getDatabaseConfig = (): PoolConfig => {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
        return {
            connectionString: databaseUrl,
            ssl: process.env.DB_SSL === 'false' ? false : {
                rejectUnauthorized: false
            }
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

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result.rows;
    } finally {
        client.release();
    }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
}

export async function closePool(): Promise<void> {
    await pool.end();
}

