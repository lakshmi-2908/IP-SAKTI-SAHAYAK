import crypto from 'crypto';
import { getSupabaseClient, getPgPool } from './supabase';

export interface ConversationRecord {
  id: string;
  created_at: string;
  jurisdiction: string;
  language: string;
  classification_result?: any;
  messages: any[];
}

export interface FeedbackRecord {
  id: string;
  conversation_id: string;
  message_id: string;
  rating: 'up' | 'down';
  created_at: string;
}

// In-memory conversations storage
const inMemoryConversations = new Map<string, ConversationRecord>();
// In-memory feedback storage
const inMemoryFeedback: FeedbackRecord[] = [];
// Prompt 13 in-memory cache
const inMemoryConversationCache = new Map<string, any>();

/**
 * Creates or updates a conversation in database / in-memory store.
 */
export async function createOrUpdateConversation(data: {
  id?: string;
  jurisdiction?: string;
  language?: string;
  classification_result?: any;
  messages?: any[];
}): Promise<string> {
  const convId = data.id || crypto.randomUUID();
  const existing = inMemoryConversations.get(convId);

  const record: ConversationRecord = {
    id: convId,
    created_at: existing ? existing.created_at : new Date().toISOString(),
    jurisdiction: data.jurisdiction || existing?.jurisdiction || 'india',
    language: data.language || existing?.language || 'English',
    classification_result: data.classification_result !== undefined ? data.classification_result : existing?.classification_result,
    messages: data.messages || existing?.messages || [],
  };

  inMemoryConversations.set(convId, record);

  // Attempt database persistence if configured
  const pool = getPgPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO conversations (id, created_at, jurisdiction, language, classification_result, messages)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             jurisdiction = EXCLUDED.jurisdiction,
             language = EXCLUDED.language,
             classification_result = EXCLUDED.classification_result,
             messages = EXCLUDED.messages`,
          [
            record.id,
            record.created_at,
            record.jurisdiction,
            record.language,
            JSON.stringify(record.classification_result || {}),
            JSON.stringify(record.messages || []),
          ]
        );
      } finally {
        client.release();
      }
    } catch (dbErr: any) {
      // Graceful fallback to memory
    }
  } else {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('conversations').upsert({
          id: record.id,
          jurisdiction: record.jurisdiction,
          language: record.language,
          classification_result: record.classification_result,
          messages: record.messages,
        });
      } catch (err) {
        // Fallback
      }
    }
  }

  return convId;
}

/**
 * Appends a message to a conversation.
 */
export async function appendMessageToConversation(convId: string, message: any): Promise<void> {
  let record = inMemoryConversations.get(convId);
  if (!record) {
    record = {
      id: convId,
      created_at: new Date().toISOString(),
      jurisdiction: 'india',
      language: 'English',
      messages: [],
    };
    inMemoryConversations.set(convId, record);
  }

  record.messages.push(message);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('conversations').update({
        messages: record.messages,
      }).eq('id', convId);
    } catch {
      // ignore
    }
  }
}

/**
 * Resets / clears in-memory cache for a conversation or all conversations.
 */
export function clearConversationCache(convId?: string): void {
  if (convId) {
    inMemoryConversationCache.delete(convId);
    console.log(`[Conversations] Cleared in-memory cache for conversation: ${convId}`);
  } else {
    inMemoryConversationCache.clear();
    console.log(`[Conversations] Cleared all in-memory conversation caches.`);
  }
}

/**
 * Inserts feedback into the feedback table and in-memory log.
 */
export async function insertFeedback(data: {
  conversation_id: string;
  message_id: string;
  rating: 'up' | 'down';
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const entry: FeedbackRecord = {
    id,
    conversation_id: data.conversation_id,
    message_id: data.message_id,
    rating: data.rating,
    created_at: new Date().toISOString(),
  };

  inMemoryFeedback.push(entry);
  console.log(`[Feedback Table] Recorded feedback id=${id}, msg=${data.message_id}, conv=${data.conversation_id}, rating=${data.rating}`);

  const pool = getPgPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO feedback (id, conversation_id, message_id, rating, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [entry.id, entry.conversation_id, entry.message_id, entry.rating, entry.created_at]
        );
      } finally {
        client.release();
      }
      return { id };
    } catch (e: any) {
      console.warn('[Feedback] Postgres insert fallback:', e.message);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('feedback').insert({
        id: entry.id,
        conversation_id: entry.conversation_id,
        message_id: entry.message_id,
        rating: entry.rating,
      });
    } catch (e: any) {
      console.warn('[Feedback] Supabase insert fallback:', e.message);
    }
  }

  return { id };
}

export interface EscalationRecord {
  id: string;
  conversation_id: string;
  name: string;
  contact: string;
  preferred_language: string;
  question_summary: string;
  status: string;
  created_at: string;
}

const inMemoryEscalations: EscalationRecord[] = [];

/**
 * Inserts an escalation ticket into the escalations table and in-memory log.
 */
export async function insertEscalation(data: {
  conversation_id: string;
  name: string;
  contact: string;
  preferred_language: string;
  question_summary: string;
  status?: string;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const entry: EscalationRecord = {
    id,
    conversation_id: data.conversation_id,
    name: data.name || '',
    contact: data.contact || '',
    preferred_language: data.preferred_language || 'English',
    question_summary: data.question_summary || '',
    status: data.status || 'open',
    created_at: new Date().toISOString(),
  };

  inMemoryEscalations.push(entry);
  console.log(`[Escalations Table] Recorded escalation id=${id}, conv=${data.conversation_id}, name=${data.name}, contact=${data.contact}`);

  const pool = getPgPool();
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.conversation_id);
        if (isUuid) {
          await client.query(
            `INSERT INTO conversations (id, created_at, jurisdiction, language)
             VALUES ($1, NOW(), 'india', $2)
             ON CONFLICT (id) DO NOTHING`,
            [entry.conversation_id, entry.preferred_language]
          ).catch(() => {});
        }

        await client.query(
          `INSERT INTO escalations (id, conversation_id, name, contact, preferred_language, question_summary, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            entry.id,
            isUuid ? entry.conversation_id : null,
            entry.name,
            entry.contact,
            entry.preferred_language,
            entry.question_summary,
            entry.status,
            entry.created_at,
          ]
        );
      } finally {
        client.release();
      }
      return { id };
    } catch (e: any) {
      console.warn('[Escalations] Postgres insert fallback:', e.message);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.conversation_id);
      if (isUuid) {
        await supabase.from('conversations').upsert({
          id: entry.conversation_id,
          language: entry.preferred_language,
        });
      }

      await supabase.from('escalations').insert({
        id: entry.id,
        conversation_id: isUuid ? entry.conversation_id : undefined,
        name: entry.name,
        contact: entry.contact,
        preferred_language: entry.preferred_language,
        question_summary: entry.question_summary,
        status: entry.status,
      });
    } catch (e: any) {
      console.warn('[Escalations] Supabase insert fallback:', e.message);
    }
  }

  return { id };
}

export async function getEscalations(conversationId?: string): Promise<EscalationRecord[]> {
  if (conversationId) {
    return inMemoryEscalations.filter((e) => e.conversation_id === conversationId);
  }
  return inMemoryEscalations;
}

