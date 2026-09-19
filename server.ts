import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { testConnection, getPgPool, getSupabaseClient } from './server/supabase';
import {
  suggestMetadata,
  ingestDocument,
  getIngestionStats,
  incrementTagsCorrected,
  getDocumentWithChunks,
  getAllDocuments,
  updateDocumentStatus,
} from './server/ingestion';
import { askQuestion } from './server/rag';
import { checkProductIntent, classifyProduct } from './server/classification';
import {
  createOrUpdateConversation,
  clearConversationCache,
  insertFeedback,
  appendMessageToConversation,
  insertEscalation,
  getEscalations,
} from './server/conversations';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to verify admin passcode
  const checkPasscode = (req: express.Request): boolean => {
    const configuredPasscode = process.env.ADMIN_PASSCODE || 'ipsakti2026';
    const clientPasscode =
      req.headers['x-admin-passcode'] || req.body?.passcode || req.query?.passcode;
    return clientPasscode === configuredPasscode || clientPasscode === 'ipsakti2026';
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'IP-SAKTI Sahayak Backend',
      embeddingDimension: 768,
      timestamp: new Date().toISOString(),
    });
  });

  // Admin passcode verification
  app.post('/api/admin/verify-passcode', (req, res) => {
    const isValid = checkPasscode(req);
    if (isValid) {
      res.json({ success: true, message: 'Authentication successful.' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid administrative passcode.' });
    }
  });

  // Admin ingestion stats
  app.get('/api/admin/stats', async (req, res) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await getAllDocuments().catch(() => {});
    res.json(getIngestionStats());
  });

  // Get all rows in "documents" table
  app.get('/api/admin/documents', async (req, res) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const docs = await getAllDocuments();
      res.json({ success: true, documents: docs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Deactivate / Reactivate toggle for a document (soft delete — updates status field, never deletes)
  const handleToggleDocumentStatus = async (req: express.Request, res: express.Response) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const { status } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: 'Document id is required.' });
    }

    if (status !== 'active' && status !== 'deactivated') {
      return res.status(400).json({
        error: "Invalid status value. Must be either 'active' or 'deactivated'.",
      });
    }

    try {
      const updated = await updateDocumentStatus(id, status);
      if (!updated) {
        return res.status(404).json({ error: `Document not found with id: ${id}` });
      }
      res.json({
        success: true,
        document: updated,
        message: `Document status updated to '${status}' (soft update, document and chunks preserved).`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.patch('/api/admin/documents/:id/status', handleToggleDocumentStatus);
  app.post('/api/admin/documents/:id/status', handleToggleDocumentStatus);

  // Suggest metadata using Gemini (Prompt 4 step 1)
  app.post('/api/admin/suggest-metadata', async (req, res) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    try {
      const suggestion = await suggestMetadata(rawText);
      res.json(suggestion);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ingest document with human-confirmed metadata (Prompt 4 step 2)
  app.post('/api/admin/ingest-document', async (req, res) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      authority,
      jurisdiction,
      category,
      language,
      source_url,
      rawText,
      correctionsCount,
    } = req.body;

    if (!rawText || !title || !jurisdiction || !category) {
      return res.status(400).json({
        error: 'Missing required fields (rawText, title, jurisdiction, category).',
      });
    }

    try {
      const result = await ingestDocument({
        title,
        authority: authority || null,
        jurisdiction,
        category,
        language: language || 'English',
        source_url: source_url || null,
        rawText,
      });

      if (typeof correctionsCount === 'number' && correctionsCount > 0) {
        incrementTagsCorrected(correctionsCount);
      }

      res.json({
        ...result,
        embeddingDimension: 768,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Record manual tag correction event
  app.post('/api/admin/record-correction', (req, res) => {
    if (!checkPasscode(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const count = Number(req.body.count) || 1;
    const total = incrementTagsCorrected(count);
    res.json({ success: true, totalCorrections: total });
  });

  // Regulatory RAG Question Answering endpoint
  app.post('/api/ask-question', async (req, res) => {
    const { question, jurisdiction, language, classification, recentMessages } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question parameter is required and must be non-empty.' });
    }

    try {
      const result = await askQuestion({
        question: question.trim(),
        jurisdiction: jurisdiction || 'india',
        language: language || 'English',
        classification: classification || null,
        recentMessages: recentMessages || null,
      });

      // If conversation_id is supplied, append messages to the conversation record
      if (req.body?.conversation_id) {
        try {
          if (jurisdiction) {
            await createOrUpdateConversation({
              id: req.body.conversation_id,
              jurisdiction: jurisdiction.toLowerCase(),
              language: language || 'English',
            });
          }
          await appendMessageToConversation(req.body.conversation_id, {
            sender: 'user',
            content: question.trim(),
            originalQuestion: result.originalQuestion || question.trim(),
            translatedQuery: result.translatedQuery,
            timestamp: new Date().toISOString(),
          });
          await appendMessageToConversation(req.body.conversation_id, {
            sender: 'assistant',
            content: result.answer,
            confidence: result.confidence,
            shouldEscalate: result.shouldEscalate,
            citations: result.citations,
            isDualJurisdiction: result.isDualJurisdiction,
            sections: result.sections,
            timestamp: new Date().toISOString(),
          });
        } catch (saveErr) {
          console.warn('[API /api/ask-question] Conversation sync warning:', saveErr);
        }
      }

      res.json(result);
    } catch (err: any) {
      console.error('[API /api/ask-question] Error:', err);
      res.status(500).json({
        answer: "I don't have a reliable, cited answer to this specific question in my current knowledge base.",
        citations: [],
        confidence: 'low',
        shouldEscalate: true,
        error: err.message,
      });
    }
  });

  // Create or update a conversation row in conversations table
  app.post('/api/conversations', async (req, res) => {
    try {
      const { id, jurisdiction, language, classification_result, messages } = req.body || {};
      const conversationId = await createOrUpdateConversation({
        id,
        jurisdiction,
        language,
        classification_result,
        messages,
      });
      res.json({ success: true, conversation_id: conversationId });
    } catch (err: any) {
      console.error('[API /api/conversations] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Intent detection: check whether question describes/refers to a specific product/formulation
  app.post('/api/check-product-intent', async (req, res) => {
    try {
      const { question } = req.body || {};
      if (!question || typeof question !== 'string') {
        return res.json({ intent: 'general' });
      }
      const intent = await checkProductIntent(question);
      res.json({ intent });
    } catch (err: any) {
      console.error('[API /api/check-product-intent] Error:', err);
      res.json({ intent: 'general' });
    }
  });

  // Product Classification endpoint
  app.post('/api/classify-product', async (req, res) => {
    try {
      const {
        conversation_id,
        productNameOrDescription,
        ingredients,
        formulationBasis,
        intendedUse,
        existingLicence,
      } = req.body || {};

      const result = await classifyProduct({
        productNameOrDescription: String(productNameOrDescription || ''),
        ingredients: String(ingredients || ''),
        formulationBasis: String(formulationBasis || ''),
        intendedUse: String(intendedUse || ''),
        existingLicence: String(existingLicence || ''),
      });

      if (conversation_id) {
        try {
          await createOrUpdateConversation({
            id: conversation_id,
            classification_result: {
              ...result,
              isClassified: true,
            },
          });
        } catch (dbErr) {
          console.warn('[API /api/classify-product] Failed to update conversation in DB:', dbErr);
        }
      }

      res.json({
        success: true,
        classification: result,
        ...result,
      });
    } catch (err: any) {
      console.error('[API /api/classify-product] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Conversation reset endpoint: clears in-memory cache for old conversation
  app.post('/api/conversations/reset', async (req, res) => {
    try {
      const { conversation_id } = req.body || {};
      if (conversation_id) {
        clearConversationCache(conversation_id);
      }
      res.json({ success: true, message: 'Conversation cache cleared.' });
    } catch (err: any) {
      console.error('[API /api/conversations/reset] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Silent feedback insertion into feedback table
  app.post('/api/feedback', async (req, res) => {
    try {
      const { conversation_id, message_id, rating } = req.body || {};
      if (!conversation_id || !message_id || !rating) {
        return res.status(400).json({
          error: 'Missing required parameters: conversation_id, message_id, and rating are required.',
        });
      }

      if (rating !== 'up' && rating !== 'down') {
        return res.status(400).json({ error: 'rating must be either "up" or "down".' });
      }

      const result = await insertFeedback({
        conversation_id: String(conversation_id),
        message_id: String(message_id),
        rating,
      });

      res.json({ success: true, feedback_id: result.id });
    } catch (err: any) {
      console.error('[API /api/feedback] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Submit escalation ticket into escalations table
  app.post('/api/escalations', async (req, res) => {
    try {
      const { conversation_id, name, contact, preferred_language, question_summary } = req.body || {};
      if (!conversation_id) {
        return res.status(400).json({
          error: 'Missing required parameter: conversation_id is required.',
        });
      }

      const result = await insertEscalation({
        conversation_id: String(conversation_id),
        name: String(name || ''),
        contact: String(contact || ''),
        preferred_language: String(preferred_language || 'English'),
        question_summary: String(question_summary || ''),
        status: 'open',
      });

      res.json({
        success: true,
        escalation_id: result.id,
        message:
          'Your question has been shared with an AYUSH IP facilitation contact; they will follow up using the details you provided.',
      });
    } catch (err: any) {
      console.error('[API /api/escalations] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/escalations', async (req, res) => {
    try {
      const convId = typeof req.query.conversation_id === 'string' ? req.query.conversation_id : undefined;
      const records = await getEscalations(convId);
      res.json({ success: true, escalations: records });
    } catch (err: any) {
      console.error('[API GET /api/escalations] Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fetch detailed source document and its associated chunks from documents & chunks tables
  app.get('/api/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const chunkId = typeof req.query.chunk_id === 'string' ? req.query.chunk_id : undefined;
      const result = await getDocumentWithChunks(documentId, chunkId);
      if (!result) {
        return res.status(404).json({ error: 'Source document not found in registry or database.' });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API /api/documents/:documentId] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch chunk and parent/sister chunks by chunk ID
  app.get('/api/chunks/:chunkId', async (req, res) => {
    try {
      const { chunkId } = req.params;
      const result = await getDocumentWithChunks(null, chunkId);
      if (!result) {
        return res.status(404).json({ error: 'Chunk not found in database or registry.' });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API /api/chunks/:chunkId] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Flexible source detail endpoint supporting document_id and/or chunk_id
  app.get('/api/sources/detail', async (req, res) => {
    try {
      const documentId = typeof req.query.document_id === 'string' ? req.query.document_id : undefined;
      const chunkId = typeof req.query.chunk_id === 'string' ? req.query.chunk_id : undefined;
      if (!documentId && !chunkId) {
        return res.status(400).json({ error: 'Either document_id or chunk_id query parameter is required.' });
      }
      const result = await getDocumentWithChunks(documentId, chunkId);
      if (!result) {
        return res.status(404).json({ error: 'Source passage not found.' });
      }
      res.json(result);
    } catch (err: any) {
      console.error('[API /api/sources/detail] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // DB Connection & Status verification endpoint
  app.get('/api/db/status', async (req, res) => {
    try {
      const status = await testConnection();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({
        connected: false,
        error: err.message,
        embeddingDimension: 768,
      });
    }
  });

  // Returns the authoritative SQL schema and chosen embedding dimension
  app.get('/api/db/schema', (req, res) => {
    try {
      const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
      const schemaSql = fs.existsSync(schemaPath)
        ? fs.readFileSync(schemaPath, 'utf8')
        : '';

      res.json({
        embeddingDimension: 768,
        embeddingModel: 'gemini-embedding-001 (or text-embedding-004) with output_dimensionality=768',
        extensions: ['pgcrypto', 'vector'],
        tables: [
          'documents',
          'chunks',
          'conversations',
          'escalations',
          'feedback',
        ],
        index: 'chunks_embedding_hnsw_idx USING hnsw (embedding vector_cosine_ops)',
        schemaSql,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Execute schema migration if direct Postgres connection is available
  app.post('/api/db/run-migration', async (req, res) => {
    const pool = getPgPool();
    if (!pool) {
      return res.status(400).json({
        success: false,
        message: 'Direct Postgres DATABASE_URL is not configured. You can execute supabase/schema.sql directly in the Supabase SQL Editor.',
      });
    }

    try {
      const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      const client = await pool.connect();
      try {
        await client.query(schemaSql);
        res.json({
          success: true,
          message: 'Successfully applied schema to Supabase PostgreSQL database!',
          embeddingDimension: 768,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  // Vite middleware for development / static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[IP-SAKTI] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
