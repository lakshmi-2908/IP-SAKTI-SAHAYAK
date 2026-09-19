import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

let supabaseClient: SupabaseClient | null = null;
let pgPool: pg.Pool | null = null;

/**
 * Returns a lazily-initialized Supabase administrative client
 * using the Service Role Key for backend tasks.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}

/**
 * Returns a lazily-initialized PostgreSQL pool if DATABASE_URL or direct connection is provided.
 */
export function getPgPool(): pg.Pool | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('[YOUR-PASSWORD]') || databaseUrl.includes('[PASSWORD]')) {
    return null;
  }

  if (!pgPool) {
    try {
      pgPool = new pg.Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 2500,
        ssl: {
          rejectUnauthorized: false,
        },
      });
      pgPool.on('error', (err) => {
        console.warn('[Postgres Pool] Idle client error caught gracefully:', err.message);
      });
    } catch (err: any) {
      console.warn('[Postgres Pool] Initialization error:', err.message);
      pgPool = null;
    }
  }

  return pgPool;
}

/**
 * Checks connection status to Supabase / Postgres.
 */
export async function testConnection(): Promise<{
  connected: boolean;
  type: 'supabase_api' | 'postgres_direct' | 'none';
  message: string;
  tables?: string[];
  embeddingDimension?: number;
}> {
  // Try direct Postgres connection first if available
  const pool = getPgPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const res = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        const tables = res.rows.map((r: { table_name: string }) => r.table_name);
        return {
          connected: true,
          type: 'postgres_direct',
          message: 'Connected to Supabase PostgreSQL database directly via DATABASE_URL.',
          tables,
          embeddingDimension: 768,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('Direct PostgreSQL connection error:', err.message);
    }
  }

  // Fallback to Supabase REST client
  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      type: 'none',
      message: 'Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.',
      embeddingDimension: 768,
    };
  }

  try {
    // Probe documents or conversations table
    const { error } = await client.from('documents').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      return {
        connected: true,
        type: 'supabase_api',
        message: `Connected to Supabase REST endpoint (${process.env.SUPABASE_URL}), but tables may need initialization: ${error.message}`,
        embeddingDimension: 768,
      };
    }

    return {
      connected: true,
      type: 'supabase_api',
      message: 'Successfully connected to Supabase project.',
      tables: ['documents', 'chunks', 'conversations', 'escalations', 'feedback'],
      embeddingDimension: 768,
    };
  } catch (err: any) {
    return {
      connected: false,
      type: 'supabase_api',
      message: `Failed to query Supabase: ${err.message}`,
      embeddingDimension: 768,
    };
  }
}
