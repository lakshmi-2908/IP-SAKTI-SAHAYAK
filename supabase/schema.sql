-- IP-SAKTI Sahayak Supabase Postgres Schema
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  authority text,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('india', 'international')),
  category text CHECK (category IN ('patent', 'trademark', 'GI', 'ABS', 'regulatory', 'TKDL')),
  language text,
  source_url text,
  upload_date timestamp DEFAULT now(),
  status text DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  version int DEFAULT 1
);

-- 2. chunks table
-- Chosen embedding dimension: 768 (strictly matching Prompt 4 ingestion & Prompt 5 search)
CREATE TABLE IF NOT EXISTS chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  text text NOT NULL,
  embedding vector(768),
  section_label text,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('india', 'international')),
  category text,
  language text
);

-- 3. conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp DEFAULT now(),
  jurisdiction text,
  language text,
  classification_result jsonb,
  messages jsonb DEFAULT '[]'::jsonb
);

-- 4. escalations table
CREATE TABLE IF NOT EXISTS escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id),
  name text,
  contact text,
  preferred_language text,
  question_summary text,
  created_at timestamp DEFAULT now(),
  status text DEFAULT 'open'
);

-- 5. feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  message_id text,
  rating text,
  created_at timestamp DEFAULT now()
);

-- HNSW Cosine vector similarity search index
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx 
ON chunks 
USING hnsw (embedding vector_cosine_ops);

-- Cosine similarity match helper for Supabase RPC search
CREATE OR REPLACE FUNCTION match_chunks (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.2,
  match_count int DEFAULT 5,
  filter_jurisdiction text DEFAULT NULL,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  text text,
  section_label text,
  jurisdiction text,
  category text,
  language text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    chunks.id,
    chunks.document_id,
    chunks.text,
    chunks.section_label,
    chunks.jurisdiction,
    chunks.category,
    chunks.language,
    (1 - (chunks.embedding <=> query_embedding))::float AS similarity
  FROM chunks
  JOIN documents d ON d.id = chunks.document_id
  WHERE d.status = 'active'
    AND (filter_jurisdiction IS NULL OR chunks.jurisdiction = filter_jurisdiction)
    AND (filter_category IS NULL OR chunks.category = filter_category)
    AND (chunks.embedding IS NOT NULL)
    AND (1 - (chunks.embedding <=> query_embedding) > match_threshold)
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Permissions for Supabase API access (service_role, anon, authenticated)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- Notify PostgREST to immediately refresh its schema cache
NOTIFY pgrst, 'reload schema';

