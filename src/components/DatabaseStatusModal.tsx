import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  Server,
  KeyRound,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [status, setStatus] = useState<any>(null);
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    Promise.all([
      fetch('/api/db/status').then((res) => res.json()).catch(() => null),
      fetch('/api/db/schema').then((res) => res.json()).catch(() => null),
    ])
      .then(([statusData, schemaData]) => {
        setStatus(statusData);
        setSchemaInfo(schemaData);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopySql = () => {
    if (schemaInfo?.schemaSql) {
      navigator.clipboard.writeText(schemaInfo.schemaSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      id="db-status-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="db-status-modal"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6"
      >
        {/* Header */}
        <div className="bg-[#0B3B32] text-white px-6 py-4 flex items-center justify-between border-b border-teal-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-teal-950 border border-teal-700/50 text-emerald-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide font-display">
                Supabase Postgres & Vector Storage
              </h2>
              <p className="text-xs text-teal-200">
                PostgreSQL Schema, pgvector & Dimension Registry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-teal-200 hover:text-white rounded-md hover:bg-teal-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs text-slate-700 max-h-[75vh] overflow-y-auto">
          {/* Embedding Dimension Benchmark Box */}
          <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-start space-x-3">
            <div className="p-1.5 rounded-lg bg-emerald-700 text-white shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 text-sm">
                  Embedding Dimension Standard: 768
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-200/80 text-emerald-900">
                  vector(768)
                </span>
              </div>
              <p className="text-emerald-900/90 leading-relaxed text-[11.5px]">
                Chosen Dimension: <strong>768 dimensions</strong>. This exact dimension is strictly
                configured in the PostgreSQL column schema (<code className="font-mono text-[10px] bg-emerald-100 px-1 py-0.2 rounded">chunks.embedding vector(768)</code>),
                and is bound to all document chunk ingestion and user search embedding calls (<code className="font-mono text-[10px] bg-emerald-100 px-1 py-0.2 rounded">output_dimensionality: 768</code>).
              </p>
              <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-950 flex flex-wrap items-center gap-1.5 font-medium">
                <span className="text-emerald-800 font-semibold">Resilient Pipeline:</span>
                <span className="bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono">Gemini Embeddings</span>
                <span className="text-emerald-600">→ (on 429)</span>
                <span className="bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono">OpenRouter Nemotron 3 Embed 1B:free</span>
                <span className="text-emerald-600">→</span>
                <span className="bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono">Deterministic 768-dim Fallback</span>
              </div>
            </div>
          </div>

          {/* Connection Status Panel */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-teal-800" />
                Backend Connection Status
              </span>
              {loading ? (
                <span className="text-slate-400 font-medium">Checking...</span>
              ) : status?.connected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Connected ({status.type})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                  <AlertCircle className="w-3 h-3" /> Awaiting Credentials
                </span>
              )}
            </div>

            <p className="text-slate-600 text-[11px] leading-relaxed">
              {status?.message || 'Server ready to connect using SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'}
            </p>

            <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-teal-800" />
              <span>Credentials managed strictly in server environment variables (never exposed to browser).</span>
            </div>
          </div>

          {/* Database Schema Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-800" />
                Configured PostgreSQL Tables & Extensions
              </span>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1 text-[11px] text-teal-800 hover:text-teal-950 font-semibold cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied SQL' : 'Copy SQL Schema'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-900">1. documents</div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  Metadata for statutory acts, TKDL monographs & gazettes (jurisdiction, category, version).
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-900">2. chunks</div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  Text slices with <strong>embedding vector(768)</strong> & HNSW cosine index.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-900">3. conversations</div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  Guidance sessions, regime states, classification JSON & message history.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="font-semibold text-slate-900">4. escalations</div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  AYUSH regulatory officer & legal expert handoff tickets.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 sm:col-span-2">
                <div className="font-semibold text-slate-900">5. feedback & Extensions</div>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  Response citations ratings • Enabled: <code className="bg-slate-200 px-1 rounded">pgvector</code> & <code className="bg-slate-200 px-1 rounded">pgcrypto</code> (<code className="text-teal-800">gen_random_uuid()</code>).
                </p>
              </div>
            </div>
          </div>

          {/* Quick SQL Preview snippet */}
          <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] overflow-x-auto max-h-36">
            <pre>
{`-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- chunks table with dimension 768 and HNSW index
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

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx 
ON chunks USING hnsw (embedding vector_cosine_ops);`}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Stored in /supabase/schema.sql
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0B3B32] hover:bg-[#125447] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
