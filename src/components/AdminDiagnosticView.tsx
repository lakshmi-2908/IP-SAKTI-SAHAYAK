import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DiagnosticChunkItem, RetrievalDiagnosticInfo } from './AdminPortal';

interface AdminDiagnosticViewProps {
  lastDiagnostic: RetrievalDiagnosticInfo | null;
  isLoadingDiagnostic: boolean;
  diagnosticError: string | null;
  onRefreshDiagnostic: () => void;
  testQueryInput: string;
  onTestQueryInputChange: (val: string) => void;
  testQueryJurisdiction: 'india' | 'international';
  onTestQueryJurisdictionChange: (jur: 'india' | 'international') => void;
  testQueryLanguage: string;
  onTestQueryLanguageChange: (lang: string) => void;
  isTestingQuery: boolean;
  testQueryResult: RetrievalDiagnosticInfo | null;
  onRunTestQuery: (query?: string, jur?: 'india' | 'international') => void;
  onSwitchToBenchmarks: () => void;
}

export const AdminDiagnosticView: React.FC<AdminDiagnosticViewProps> = ({
  lastDiagnostic,
  isLoadingDiagnostic,
  diagnosticError,
  onRefreshDiagnostic,
  testQueryInput,
  onTestQueryInputChange,
  testQueryJurisdiction,
  onTestQueryJurisdictionChange,
  testQueryLanguage,
  onTestQueryLanguageChange,
  isTestingQuery,
  testQueryResult,
  onRunTestQuery,
  onSwitchToBenchmarks,
}) => {
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<'last' | 'live'>('last');

  const toggleChunk = (id: string) => {
    setExpandedChunks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderChunkCard = (chunk: DiagnosticChunkItem, index: number, isLiveResult = false) => {
    const isExpanded = !!expandedChunks[`${isLiveResult ? 'live' : 'last'}-${chunk.id}-${index}`];
    const chunkKey = `${isLiveResult ? 'live' : 'last'}-${chunk.id}-${index}`;

    // Color code similarity score
    const simPercentage = Math.min(100, Math.round(chunk.similarity * 100));
    const isHighSim = chunk.similarity >= 0.5;
    const isMediumSim = chunk.similarity >= 0.4;

    const rankBadgeClass =
      chunk.rank === 1
        ? 'bg-amber-500/20 text-amber-900 border-amber-500/40 font-bold'
        : chunk.rank === 2
        ? 'bg-slate-200 text-slate-800 border-slate-300 font-bold'
        : chunk.rank === 3
        ? 'bg-amber-700/10 text-amber-800 border-amber-700/20 font-bold'
        : 'bg-slate-100 text-slate-600 border-slate-200';

    return (
      <div
        key={chunkKey}
        id={`chunk-diagnostic-card-${chunk.rank}`}
        className={`bg-white rounded-xl border transition-all shadow-xs overflow-hidden ${
          chunk.survivedFloor
            ? 'border-emerald-200 ring-1 ring-emerald-500/20'
            : 'border-red-200 bg-red-50/10'
        }`}
      >
        {/* Card Header */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs border ${rankBadgeClass} flex items-center gap-1`}
            >
              <span>Rank #{chunk.rank}</span>
              {chunk.rank === 1 && <Sparkles className="w-3 h-3 text-amber-600" />}
            </span>

            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                  {chunk.documentTitle}
                </h4>
                {chunk.authority && (
                  <span className="hidden sm:inline-block text-[11px] font-medium text-slate-600 px-2 py-0.5 rounded bg-slate-200/60">
                    {chunk.authority}
                  </span>
                )}
              </div>
              <p className="text-xs text-teal-800 font-semibold flex items-center gap-1.5 mt-0.5">
                <FileText className="w-3 h-3 text-teal-700" />
                <span>{chunk.sectionLabel || 'General Provision'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Floor Status Pill */}
            {chunk.survivedFloor ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Cleared Floor ({chunk.similarity.toFixed(4)} ≥ {chunk.similarityFloor})</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>Below Floor ({chunk.similarity.toFixed(4)} &lt; {chunk.similarityFloor})</span>
              </span>
            )}

            {/* Similarity Score Tag */}
            <div className="text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-slate-500 font-medium">Cosine Sim:</span>
                <span
                  className={`text-sm font-mono font-bold ${
                    isHighSim
                      ? 'text-emerald-700'
                      : isMediumSim
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}
                >
                  {chunk.similarity.toFixed(4)}
                </span>
              </div>
              <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all ${
                    isHighSim
                      ? 'bg-emerald-600'
                      : isMediumSim
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${simPercentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 space-y-3">
          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Jurisdiction: <strong className="uppercase">{chunk.jurisdiction}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Category: <strong className="capitalize">{chunk.category}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] text-slate-500">
              Chunk ID: {chunk.id.slice(0, 12)}...
            </span>
          </div>

          {/* Text Content */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 font-serif text-sm text-slate-800 leading-relaxed">
            <p className="whitespace-pre-line">
              {isExpanded ? chunk.fullText : chunk.textSnippet}
            </p>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              onClick={() => toggleChunk(chunkKey)}
              className="inline-flex items-center gap-1 font-semibold text-teal-800 hover:text-teal-900 cursor-pointer"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Show Compact Excerpt</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>View Complete Chunk Text ({chunk.fullText.length} chars)</span>
                </>
              )}
            </button>

            {/* Diagnostic Insight */}
            <div className="text-slate-500 italic text-[11px]">
              {chunk.survivedFloor
                ? 'Passed into generation context block [1..' + (chunk.rank) + ']'
                : 'Excluded from LLM prompt (similarity did not meet threshold floor)'}
            </div>
          </div>

          {/* Diagnostic Root Cause Callout */}
          <div className="mt-2 p-3 rounded-lg bg-slate-100/70 border border-slate-200 text-xs space-y-1.5">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
              <span>Retrieval Assessment & Root Cause Note:</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {chunk.survivedFloor ? (
                <span>
                  The RAG hybrid engine matched this chunk with cosine similarity{' '}
                  <strong className="text-slate-800">{chunk.similarity.toFixed(4)}</strong>. It cleared the floor ({chunk.similarityFloor}) and was formatted as a numbered context block for LLM answer synthesis and factual verification.
                </span>
              ) : (
                <span>
                  This chunk scored{' '}
                  <strong className="text-red-700">{chunk.similarity.toFixed(4)}</strong>, falling below the required floor ({chunk.similarityFloor}). If users receive an abstention ("I don't have a reliable, cited answer"), it indicates the query concepts either lacked exact lexical keywords in the corpus or the document needs to be indexed under active status.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tool Header & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-teal-50 text-teal-800">
                <Activity className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  RAG Retrieval Diagnostic & Top-3 Chunk Inspector
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect the exact context chunks retrieved from uploaded PDFs for user queries to identify why answers succeed or abstain.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSubTab('last')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeSubTab === 'last'
                    ? 'bg-white text-teal-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Last User Query Trace
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('live')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeSubTab === 'live'
                    ? 'bg-white text-teal-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Live Interactive Tester
              </button>
            </div>

            <button
              id="refresh-diagnostic-btn"
              type="button"
              disabled={isLoadingDiagnostic}
              onClick={onRefreshDiagnostic}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Reload latest query telemetry from server"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-800 ${isLoadingDiagnostic ? 'animate-spin' : ''}`} />
              <span>Refresh Trace</span>
            </button>
          </div>
        </div>

        {diagnosticError && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{diagnosticError}</span>
          </div>
        )}
      </div>

      {/* Sub-Tab 1: Last User Query Trace */}
      {activeSubTab === 'last' && (
        <div className="space-y-5">
          {isLoadingDiagnostic ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-xs text-center space-y-3">
              <Loader2 className="w-8 h-8 text-teal-800 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Loading diagnostic telemetry...</p>
            </div>
          ) : !lastDiagnostic ? (
            <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 shadow-xs text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-bold text-slate-800">No User Queries Logged Yet in This Session</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Once a question is asked in the public assistant chat thread, the top-3 candidate chunks and similarity scores will appear here.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('live');
                    onRunTestQuery();
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Run Live Pharmacopoeia Test Query</span>
                </button>
                <button
                  type="button"
                  onClick={onSwitchToBenchmarks}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                >
                  <span>Browse Benchmark Suite</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Telemetry Header Summary Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-900 border border-teal-200">
                      Query Jurisdiction: {lastDiagnostic.jurisdiction.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                      Language: {lastDiagnostic.language}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(lastDiagnostic.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Confidence & Escalation Status */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        lastDiagnostic.confidence === 'high'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : lastDiagnostic.confidence === 'medium'
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-red-50 text-red-800 border-red-300'
                      }`}
                    >
                      Confidence: {(lastDiagnostic.confidence || 'medium').toUpperCase()}
                    </span>

                    {lastDiagnostic.shouldEscalate && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Escalation Triggered</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Details */}
                <div className="space-y-2">
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      User Question:
                    </div>
                    <div className="text-base font-semibold text-slate-900 mt-0.5">
                      "{lastDiagnostic.query}"
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-mono text-slate-600 break-all">
                    <span className="text-slate-400 select-none">Augmented Retrieval String: </span>
                    {lastDiagnostic.retrievalQuery}
                  </div>
                </div>

                {/* Score Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">Top Cosine Match</div>
                    <div className="text-lg font-bold text-slate-900 font-mono">
                      {lastDiagnostic.topScore.toFixed(4)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">Active Similarity Floor</div>
                    <div className="text-lg font-bold text-slate-900 font-mono">
                      {lastDiagnostic.similarityFloor}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">Surviving Chunks</div>
                    <div className="text-lg font-bold text-emerald-700">
                      {lastDiagnostic.survivingCount} / {lastDiagnostic.totalCandidateCount}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">RAG Synthesis Status</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">
                      {lastDiagnostic.survivingCount > 0 ? 'Grounded Synthesis' : 'Abstention Triggered'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top 3 Retrieved Chunks List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-800" />
                    <span>Top Retrieved Context Chunks (Ranked 1 to {Math.min(3, lastDiagnostic.topChunks.length)})</span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    Showing top {Math.min(3, lastDiagnostic.topChunks.length)} of {lastDiagnostic.topChunks.length} candidates evaluated
                  </span>
                </div>

                {lastDiagnostic.topChunks.length === 0 ? (
                  <div className="p-6 bg-white rounded-xl border border-slate-200 text-center text-sm text-slate-500">
                    No matching candidate chunks found in the database for jurisdiction "{lastDiagnostic.jurisdiction}".
                  </div>
                ) : (
                  lastDiagnostic.topChunks.slice(0, 3).map((chunk, idx) =>
                    renderChunkCard(chunk, idx, false)
                  )
                )}

                {lastDiagnostic.topChunks.length > 3 && (
                  <details className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <summary className="text-xs font-semibold text-slate-700 cursor-pointer hover:text-teal-800">
                      View Additional Lower-Ranked Candidates (#{4} to #{lastDiagnostic.topChunks.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {lastDiagnostic.topChunks.slice(3).map((chunk, idx) =>
                        renderChunkCard(chunk, idx + 3, false)
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Live Interactive Tester */}
      {activeSubTab === 'live' && (
        <div className="space-y-5">
          {/* Query Formulation Form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-teal-800" />
                <span>Execute Diagnostic Query Retrieval Test</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Type any query to test cosine similarity scoring, floor survival, and chunk extraction without affecting public chat history.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Test Question:
                </label>
                <textarea
                  id="admin-diagnostic-query-input"
                  rows={2}
                  value={testQueryInput}
                  onChange={(e) => onTestQueryInputChange(e.target.value)}
                  placeholder="e.g. What are the characteristic testing stages of Paka Lakshana in Sneha Kalpana (Mridu, Madhyama, and Khara Paka)?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jurisdiction:
                  </label>
                  <select
                    id="admin-diagnostic-jurisdiction-select"
                    value={testQueryJurisdiction}
                    onChange={(e) =>
                      onTestQueryJurisdictionChange(e.target.value as 'india' | 'international')
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-teal-600"
                  >
                    <option value="india">India (Patents Act, API, TKDL, NBA)</option>
                    <option value="international">International (USPTO, EPO, WIPO, FDA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Language:
                  </label>
                  <select
                    id="admin-diagnostic-language-select"
                    value={testQueryLanguage}
                    onChange={(e) => onTestQueryLanguageChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:border-teal-600"
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi (Devanagari)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    id="admin-run-diagnostic-test-btn"
                    type="button"
                    disabled={isTestingQuery || !testQueryInput.trim()}
                    onClick={() => onRunTestQuery()}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white font-bold text-xs transition-all disabled:opacity-50 cursor-pointer shadow-xs flex items-center justify-center gap-2"
                  >
                    {isTestingQuery ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Running Vector Retrieval...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Run Diagnostic Retrieval</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Test Results Display */}
          {testQueryResult && (
            <div className="space-y-5">
              {/* Telemetry Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                      Live Retrieval Result
                    </span>
                    <span className="text-xs text-slate-500">
                      Evaluated against active vector database
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500">
                      Top Similarity: <strong className="text-slate-800">{testQueryResult.topScore.toFixed(4)}</strong>
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      Floor: <strong className="text-slate-800">{testQueryResult.similarityFloor}</strong>
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-500 uppercase">Tested Query:</div>
                  <div className="text-sm font-semibold text-slate-900">"{testQueryResult.query}"</div>
                  <div className="text-xs font-mono text-slate-500 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                    {testQueryResult.retrievalQuery}
                  </div>
                </div>
              </div>

              {/* Top 3 Live Chunks */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-800" />
                  <span>Top 3 Live Retrieved Chunks</span>
                </h3>

                {testQueryResult.topChunks.length === 0 ? (
                  <div className="p-6 bg-white rounded-xl border border-slate-200 text-center text-sm text-slate-500">
                    Zero candidate chunks found.
                  </div>
                ) : (
                  testQueryResult.topChunks.slice(0, 3).map((chunk, idx) =>
                    renderChunkCard(chunk, idx, true)
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
