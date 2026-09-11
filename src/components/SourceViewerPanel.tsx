import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  X,
  ExternalLink,
  Scale,
  Globe,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Bookmark,
  Layers,
  Sparkles,
  Loader2,
  Building,
} from 'lucide-react';
import { SourceCitation, DocumentDetail, ChunkDetail, CitedChunkInfo } from '../types';

interface SourceViewerPanelProps {
  source: SourceCitation | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Highlights the specific cited sentence within its surrounding paragraph for context.
 */
function renderHighlightedPassage(passageText: string, citedSentence?: string) {
  if (!passageText) {
    return <p className="font-serif text-slate-500 italic text-sm">Passage text is being retrieved...</p>;
  }

  const cleanCited = citedSentence ? citedSentence.trim() : '';
  if (!cleanCited) {
    return <p className="font-serif text-slate-800 text-sm sm:text-base leading-relaxed whitespace-pre-line">{passageText}</p>;
  }

  // 1. Direct substring match
  const idx = passageText.indexOf(cleanCited);
  if (idx !== -1) {
    const before = passageText.slice(0, idx);
    const highlighted = passageText.slice(idx, idx + cleanCited.length);
    const after = passageText.slice(idx + cleanCited.length);
    return (
      <p className="font-serif text-slate-800 text-sm sm:text-base leading-relaxed whitespace-pre-line">
        {before}
        <mark
          id="cited-sentence-highlight"
          className="bg-amber-100 text-amber-950 font-semibold px-1.5 py-0.5 rounded border border-amber-300 shadow-2xs inline"
          title="Exact cited statutory sentence"
        >
          {highlighted}
        </mark>
        {after}
      </p>
    );
  }

  // 2. Sentence-level fuzzy/token match
  const sentences = passageText.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0);
  const targetWords = new Set(
    cleanCited
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !['this', 'that', 'with', 'from', 'under', 'have', 'been'].includes(w))
  );

  let bestIdx = -1;
  let maxOverlap = 0;

  sentences.forEach((sent, sIdx) => {
    const sWords = sent.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    let overlap = 0;
    for (const w of sWords) {
      if (targetWords.has(w)) overlap++;
    }
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestIdx = sIdx;
    }
  });

  if (bestIdx >= 0 && maxOverlap >= 2) {
    return (
      <p className="font-serif text-slate-800 text-sm sm:text-base leading-relaxed whitespace-pre-line">
        {sentences.map((sent, i) => {
          if (i === bestIdx) {
            return (
              <mark
                key={i}
                id="cited-sentence-highlight"
                className="bg-amber-100 text-amber-950 font-semibold px-1.5 py-0.5 rounded border border-amber-300 shadow-2xs inline"
                title="Exact cited statutory sentence"
              >
                {sent}{' '}
              </mark>
            );
          }
          return <span key={i}>{sent} </span>;
        })}
      </p>
    );
  }

  // Fallback: full passage text
  return <p className="font-serif text-slate-800 text-sm sm:text-base leading-relaxed whitespace-pre-line">{passageText}</p>;
}

export const SourceViewerPanel: React.FC<SourceViewerPanelProps> = ({
  source,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [docDetail, setDocDetail] = useState<DocumentDetail | null>(null);
  const [chunks, setChunks] = useState<ChunkDetail[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch document and chunk details from documents and chunks tables
  useEffect(() => {
    if (!isOpen || !source) {
      setDocDetail(null);
      setChunks([]);
      setCurrentChunkIndex(0);
      return;
    }

    const docId = source.document_id || source.id;
    const chunkId = source.chunk_id;

    let isSubscribed = true;
    setLoading(true);

    const fetchDetails = async () => {
      try {
        const queryParams = new URLSearchParams();
        if (docId) queryParams.append('document_id', docId);
        if (chunkId) queryParams.append('chunk_id', chunkId);

        const res = await fetch(`/api/sources/detail?${queryParams.toString()}`);
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const data = await res.json();
        if (isSubscribed && data) {
          setDocDetail(data.document || null);
          const retrievedChunks: ChunkDetail[] = data.chunks || [];
          setChunks(retrievedChunks);

          // Determine initial chunk index to display:
          // 1. If opened from right-rail with citedChunks history, default to the MOST RECENTLY cited chunk
          if (source.citedChunks && source.citedChunks.length > 0) {
            const mostRecentChunk = source.citedChunks[source.citedChunks.length - 1];
            const foundIdx = retrievedChunks.findIndex((c) => c.id === mostRecentChunk.chunk_id);
            if (foundIdx >= 0) {
              setCurrentChunkIndex(foundIdx);
              setLoading(false);
              return;
            }
          }

          // 2. If chunkId provided directly (e.g. from inline chip [1]), focus on that chunk
          if (chunkId) {
            const foundIdx = retrievedChunks.findIndex((c) => c.id === chunkId);
            if (foundIdx >= 0) {
              setCurrentChunkIndex(foundIdx);
              setLoading(false);
              return;
            }
          }

          // 3. Fallback to first chunk
          setCurrentChunkIndex(0);
        }
      } catch (err) {
        console.warn('[SourceViewerPanel] Could not fetch live details, using fallback:', err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, source]);

  if (!isOpen || !source) return null;

  // Resolved metadata
  const title = docDetail?.title || source.documentTitle || source.title || 'Statutory Source';
  const authority = docDetail?.authority || source.authority || source.actOrBody || 'Ministry of Ayush / Statutory Authority';
  const rawJurisdiction = docDetail?.jurisdiction || source.jurisdiction || 'India';
  const jurisdictionLabel =
    typeof rawJurisdiction === 'string'
      ? rawJurisdiction.charAt(0).toUpperCase() + rawJurisdiction.slice(1)
      : 'India';
  const language = docDetail?.language || source.language || 'English';
  const category = docDetail?.category || source.category;
  const sourceUrl = docDetail?.source_url || source.sourceUrl || source.url;

  // Active chunk computation
  const activeChunk: ChunkDetail | null = chunks.length > 0 ? chunks[currentChunkIndex] : null;

  const passageText =
    activeChunk?.text ||
    source.fullText ||
    source.snippet ||
    'Retrieved statutory passage text is being loaded from the authoritative registry.';

  const activeSection =
    activeChunk?.section_label ||
    source.sectionLabel ||
    source.sectionOrArticle ||
    'Section / Regulatory Provision';

  // Find cited sentence for the currently active chunk
  let activeCitedSentence = source.citedSentence;
  let activeHindiParaphrase = source.hindiParaphrase;
  if (source.citedChunks && activeChunk) {
    const match = source.citedChunks.find((c) => c.chunk_id === activeChunk.id);
    if (match?.citedSentence) {
      activeCitedSentence = match.citedSentence;
    }
    if (match?.hindiParaphrase) {
      activeHindiParaphrase = match.hindiParaphrase;
    }
  }

  const hasMultipleChunks = chunks.length > 1;

  const handlePrevChunk = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex((prev) => prev - 1);
    }
  };

  const handleNextChunk = () => {
    if (currentChunkIndex < chunks.length - 1) {
      setCurrentChunkIndex((prev) => prev + 1);
    }
  };

  return (
    <div
      id="source-viewer-slideover-container"
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-panel-title"
    >
      {/* Backdrop overlay */}
      <div
        id="source-viewer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300 ease-out"
        aria-hidden="true"
      />

      {/* Slide-over panel container: full-screen sheet on mobile, right slide-over on sm/md/lg */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div
          id="source-viewer-panel"
          className="w-screen sm:max-w-xl md:max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out"
        >
          {/* Panel Header */}
          <div className="bg-[#0B3B32] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-teal-900 shrink-0">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 rounded-xl bg-teal-800/80 text-teal-200 shrink-0 shadow-xs">
                <Scale className="w-5 h-5 text-teal-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {source.number && (
                    <span
                      id="source-citation-badge"
                      className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-400 text-slate-950 shadow-2xs shrink-0"
                    >
                      [{source.number}]
                    </span>
                  )}
                  <h2
                    id="source-panel-title"
                    className="text-base font-bold tracking-tight font-display text-white truncate"
                    title={title}
                  >
                    {title}
                  </h2>
                </div>
                <p className="text-xs text-teal-200/90 truncate mt-0.5 flex items-center gap-1.5">
                  <Building className="w-3 h-3 text-teal-300 shrink-0" />
                  <span className="truncate">{authority}</span>
                </p>
              </div>
            </div>

            <button
              id="close-source-panel-btn"
              onClick={onClose}
              className="p-2 rounded-lg text-teal-200 hover:text-white hover:bg-teal-800/70 transition-colors cursor-pointer ml-3 shrink-0"
              aria-label="Close source panel"
              title="Close panel (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Panel Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Metadata Tags Bar */}
            <div
              id="source-metadata-tags"
              className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200"
            >
              {/* Jurisdiction Tag */}
              <div
                id="source-jurisdiction-tag"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200"
              >
                <Globe className="w-3.5 h-3.5 text-teal-700" />
                <span>Jurisdiction: {jurisdictionLabel}</span>
              </div>

              {/* Language Tag */}
              <div
                id="source-language-tag"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
              >
                <span>Language: {language}</span>
              </div>

              {/* Category Tag */}
              {category && (
                <div
                  id="source-category-tag"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200"
                >
                  <span>{category}</span>
                </div>
              )}

              {/* Times Cited in session badge */}
              {source.timesCited && source.timesCited > 1 && (
                <div
                  id="source-session-frequency-tag"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-900 border border-purple-200 ml-auto"
                >
                  <Bookmark className="w-3 h-3 text-purple-700" />
                  <span>Cited {source.timesCited}x in conversation</span>
                </div>
              )}
            </div>

            {/* Document Title & Authority Summary Card */}
            <div
              id="source-document-card"
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                    Statutory Source Document
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                    {title}
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-md font-mono font-medium bg-white text-slate-700 border border-slate-200 shrink-0">
                  {activeSection}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Authoritative legal body: <span className="font-semibold text-slate-800">{authority}</span>
              </p>
            </div>

            {/* Multi-chunk Stepper Navigation (if document has multiple chunks) */}
            {hasMultipleChunks && (
              <div
                id="source-chunk-stepper"
                className="p-3 bg-teal-50/70 border border-teal-200 rounded-xl flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="w-4 h-4 text-teal-800 shrink-0" />
                  <span className="text-xs font-bold text-teal-950">
                    Chunk {currentChunkIndex + 1} of {chunks.length}
                  </span>
                  <span className="text-[11px] text-teal-700 truncate hidden sm:inline">
                    • {activeSection}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    id="prev-chunk-btn"
                    onClick={handlePrevChunk}
                    disabled={currentChunkIndex === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-teal-300 text-teal-900 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    aria-label="Previous chunk"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>
                  <button
                    id="next-chunk-btn"
                    onClick={handleNextChunk}
                    disabled={currentChunkIndex === chunks.length - 1}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-teal-300 text-teal-900 hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    aria-label="Next chunk"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Hindi Paraphrase Card (When Hindi query is used) */}
            {activeHindiParaphrase && (
              <div
                id="hindi-paraphrase-box"
                className="p-4 rounded-xl bg-teal-50/80 border border-teal-200/90 text-teal-950 space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-teal-900 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                  <span>एक-पंक्ति हिंदी भावार्थ (One-Line Hindi Paraphrase)</span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-teal-950 font-sans font-medium">
                  {activeHindiParaphrase}
                </p>
                <p className="text-[11px] text-teal-700 italic pt-0.5">
                  विधिक स्रोत का मूल पाठ (Original English Statutory Text) अपरिवर्तित रूप में नीचे दिया गया है:
                </p>
              </div>
            )}

            {/* Passage Section with Highlighted Sentence */}
            <div id="retrieved-passage-container" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-teal-800" />
                  <span>Exact Retrieved Passage Text</span>
                </span>

                {activeCitedSentence && (
                  <span className="text-[11px] font-medium text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Cited sentence highlighted</span>
                  </span>
                )}
              </div>

              {/* Exact passage box with highlighted sentence */}
              <div
                id="exact-passage-box"
                className="relative p-5 rounded-xl bg-[#FCFDFD] border border-teal-200/90 shadow-2xs overflow-hidden"
              >
                {loading && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center gap-2 text-xs font-medium text-teal-900 z-10">
                    <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                    <span>Retrieving passage from database...</span>
                  </div>
                )}

                {renderHighlightedPassage(passageText, activeCitedSentence)}
              </div>

              {activeCitedSentence && (
                <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80 text-[11px] text-amber-950 flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                  <p className="leading-snug">
                    <strong>Context Note:</strong> The highlighted statement directly substantiated the assistant's factual determination in the consultation thread. The surrounding text provides the verbatim statutory section context.
                  </p>
                </div>
              )}
            </div>

            {/* Official Source Link Card */}
            <div
              id="official-source-link-container"
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-teal-800" />
                <span>Statutory Authority & Verification</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                This document is maintained as part of the official gazetted AYUSH and intellectual property legal corpus. You can consult the authoritative government portal directly.
              </p>

              <div className="pt-2">
                {sourceUrl ? (
                  <a
                    id="view-official-source-btn"
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#0B3B32] hover:bg-teal-900 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <span>View official source</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <div
                    id="view-official-source-fallback"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-medium"
                  >
                    <span>Official AYUSH Regulatory Corpus Record (Source URL not designated in act)</span>
                  </div>
                )}
                {sourceUrl && (
                  <span className="block text-[11px] text-slate-600 mt-1.5">
                    External government portal: {sourceUrl}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Panel Footer */}
          <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-600">
              IP-SAKTI Sahayak Statutory Corpus
            </span>
            <button
              id="footer-close-source-panel-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
