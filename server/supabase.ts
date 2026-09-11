import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import dns from 'dns';

// In Node 18+, prefer IPv4 DNS resolution to prevent ENETUNREACH on platforms without IPv6 (e.g. Render)
try {
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore in environments where setDefaultResultOrder is unavailable
}

let supabaseClient: SupabaseClient | null = null;
let pgPool: pg.Pool | null = null;
let pgDirectUnreachableUntil = 0;
let lastPgDirectError: string | null = null;
let hasLoggedDirectPgNotice = false;

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
 * Marks direct PostgreSQL as unreachable (e.g. on ENETUNREACH or timeout)
 * to open the circuit breaker and avoid 2.5s blocking delays on subsequent requests.
 */
export function markPostgresDirectFailure(err: any): void {
  const msg = err?.message || String(err);
  const code = err?.code || '';
  lastPgDirectError = `${code ? `[${code}] ` : ''}${msg}`;

  const isNetworkUnreachable =
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ETIMEDOUT' ||
    msg.includes('ENETUNREACH') ||
    msg.includes('network is unreachable');

  if (isNetworkUnreachable) {
    // 60-second cooldown before probing direct connection again
    pgDirectUnreachableUntil = Date.now() + 60_000;
    if (!hasLoggedDirectPgNotice) {
      hasLoggedDirectPgNotice = true;
      console.warn(
        `[Postgres Pool] Direct PostgreSQL connection unreachable (${msg}). This is expected on platforms without IPv6 routing (such as Render). Direct PG attempts will be bypassed for 60s, automatically routing requests via Supabase REST/RPC API. To enable direct PostgreSQL on Render, configure DATABASE_URL using the Supabase Connection Pooler URL (aws-0-*.pooler.supabase.com:6543).`
      );
    }
  }
}

/**
 * Checks whether direct PostgreSQL pool is configured and not currently marked unreachable.
 */
export function isPostgresDirectAvailable(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes('[YOUR-PASSWORD]') || databaseUrl.includes('[PASSWORD]')) {
    return false;
  }
  if (Date.now() < pgDirectUnreachableUntil) {
    return false;
  }
  return true;
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
        connectionTimeoutMillis: 2000,
        ssl: {
          rejectUnauthorized: false,
        },
      });
      pgPool.on('error', (err) => {
        markPostgresDirectFailure(err);
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
  postgresDirectStatus?: string;
  supabaseApiStatus?: string;
}> {
  let directPgOk = false;
  let directPgMsg = 'Not configured';
  const pool = getPgPool();

  // 1. Test direct Postgres connection if configured
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
        directPgOk = true;
        directPgMsg = `Connected directly via DATABASE_URL (${tables.length} tables found)`;
        return {
          connected: true,
          type: 'postgres_direct',
          message: 'Connected to Supabase PostgreSQL database directly via DATABASE_URL.',
          tables,
          embeddingDimension: 768,
          postgresDirectStatus: directPgMsg,
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      markPostgresDirectFailure(err);
      directPgMsg = `Direct connection failed: ${err.message}`;
    }
  }

  // 2. Test Supabase REST client
  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      type: 'none',
      message: directPgMsg.includes('failed')
        ? `Postgres direct connection failed (${directPgMsg}) and Supabase REST credentials are not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`
        : 'Database credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.',
      embeddingDimension: 768,
      postgresDirectStatus: directPgMsg,
    };
  }

  try {
    // Probe documents table
    const { data: docData, error } = await client.from('documents').select('id').limit(1);

    if (error) {
      const isMissingTable =
        error.message?.includes('schema cache') ||
        error.message?.includes('relation') ||
        error.code === 'PGRST205' ||
        error.code === '42P01';

      if (isMissingTable) {
        return {
          connected: true,
          type: 'supabase_api',
          message: `Connected to Supabase project (${process.env.SUPABASE_URL}), but table 'public.documents' was not found in the schema cache. Please execute supabase/schema.sql in your Supabase SQL Editor.`,
          embeddingDimension: 768,
          postgresDirectStatus: directPgMsg,
          supabaseApiStatus: `Table 'public.documents' missing from schema cache: ${error.message}`,
        };
      }

      if (error.code !== 'PGRST116') {
        return {
          connected: true,
          type: 'supabase_api',
          message: `Connected to Supabase REST endpoint (${process.env.SUPABASE_URL}), with note: ${error.message}`,
          embeddingDimension: 768,
          postgresDirectStatus: directPgMsg,
          supabaseApiStatus: error.message,
        };
      }
    }

    return {
      connected: true,
      type: 'supabase_api',
      message: directPgOk
        ? 'Successfully connected to Supabase project.'
        : 'Successfully connected to Supabase project via REST API.',
      tables: ['documents', 'chunks', 'conversations', 'escalations', 'feedback'],
      embeddingDimension: 768,
      postgresDirectStatus: directPgMsg,
      supabaseApiStatus: 'Connected and verified',
    };
  } catch (err: any) {
    return {
      connected: false,
      type: 'supabase_api',
      message: `Failed to query Supabase: ${err.message}`,
      embeddingDimension: 768,
      postgresDirectStatus: directPgMsg,
      supabaseApiStatus: err.message,
    };
  }
}
