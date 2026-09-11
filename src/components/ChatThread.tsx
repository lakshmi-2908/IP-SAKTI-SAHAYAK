import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Scale,
  User,
  ShieldCheck,
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Info,
  Loader2,
  CornerDownRight,
  UserCheck,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Bookmark,
} from 'lucide-react';
import { ChatMessage, Jurisdiction, Language, SourceCitation } from '../types';

// Format long or noisy section labels into clean readable titles
function formatSectionLabel(label?: string | null): string {
  if (!label) return 'Relevant Provision';
  let clean = label.replace(/\r?\n|\r/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Strip trailing or leading punctuation
  clean = clean.replace(/^[#\-\*\s]+/, '');
  // If it has a colon or dot early on, cut at the boundary
  if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts[0].trim().length >= 3 && parts[0].trim().length <= 45) {
      return parts[0].trim();
    }
  }
  if (clean.length > 45) {
    return clean.slice(0, 42) + '...';
  }
  return clean || 'Relevant Provision';
}

interface ChatThreadProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  jurisdiction: Jurisdiction;
  language: Language;
  onOpenDisclaimer: () => void;
  isChatActive?: boolean;
  onOpenOnboarding?: () => void;
  isLoading?: boolean;
  onOpenSource?: (source: SourceCitation) => void;
  onOpenEscalation?: (questionSummary: string) => void;
  onFeedback?: (messageId: string, rating: 'up' | 'down') => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  messages,
  onSendMessage,
  jurisdiction,
  language,
  onOpenDisclaimer,
  isChatActive = true,
  onOpenOnboarding,
  isLoading = false,
  onOpenSource,
  onOpenEscalation,
  onFeedback,
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFocusInput = () => {
    textareaRef.current?.focus();
  };

  /**
   * Parses text and renders inline citation chips e.g. [1], [2] as clickable chips
   */
  const renderContentWithInlineCitations = (
    text: string,
    citations?: SourceCitation[]
  ) => {
    if (!text) return null;
    const regex = /\[(\d+)\]/g;
    const elements: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      if (matchStart > lastIdx) {
        elements.push(text.substring(lastIdx, matchStart));
      }

      const citNum = parseInt(match[1], 10);
      const matchedCitation = citations?.find((c) => c.number === citNum);

      if (matchedCitation && onOpenSource) {
        elements.push(
          <button
            key={`inline-cite-${matchStart}-${citNum}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSource(matchedCitation);
            }}
            className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-bold text-teal-900 bg-teal-100/90 hover:bg-teal-200 active:bg-teal-300 border border-teal-400/80 rounded-md transition-all cursor-pointer align-baseline shadow-2xs hover:scale-105"
            title={`View Source [${citNum}]: ${matchedCitation.documentTitle || matchedCitation.title || ''} (${matchedCitation.sectionLabel || matchedCitation.sectionOrArticle || ''})`}
          >
            [{citNum}]
          </button>
        );
      } else {
        elements.push(
          <span
            key={`inline-span-${matchStart}-${citNum}`}
            className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-semibold text-teal-800 bg-teal-50 border border-teal-300/70 rounded-md"
          >
            [{citNum}]
          </span>
        );
      }

      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      elements.push(text.substring(lastIdx));
    }

    return elements;
  };

  return (
    <main
      id="chat-main-panel"
      className="flex-1 flex flex-col h-full bg-[#F6F8F7] relative overflow-hidden"
    >
      {/* Workspace Sub-header / Context Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
          <span className="font-semibold text-slate-800">
            {jurisdiction === 'India'
              ? 'Indian Regulatory Regime (AYUSH, CDSCO, BDA & Indian Patent Office)'
              : 'International Regulatory Regime (WIPO, US FDA DSHEA & EMA THMPD)'}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-teal-50 text-teal-900 border border-teal-200">
            RAG ACTIVE • {language}
          </span>
        </div>
      </div>

      {/* Scrollable Messages Area */}
      <div
        id="chat-thread-container"
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6"
      >
        {/* Advisory Context Banner */}
        <div className="max-w-3xl mx-auto p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-teal-900/10 text-teal-800 shrink-0 mt-0.5">
              <Scale className="w-5 h-5" />
            </div>
            <div className="flex-1 text-xs leading-relaxed text-slate-600">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                  AYUSH Statutory & Intellectual Property Guidance Protocol
                </span>
                <button
                  onClick={onOpenDisclaimer}
                  className="text-teal-800 hover:text-teal-950 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                >
                  <span>Legal terms</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <p className="mt-1 text-slate-600">
                Grounded analysis for patentability under Section 3(p), manufacturing under Rule 158B, Schedule E(1) botanical controls, or National Biodiversity Authority (NBA) benefit-sharing.
              </p>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message, index) => {
            const isUser = message.sender === 'user';
            const isAssistant = message.sender === 'assistant';
            const hasCitations = message.citations && message.citations.length > 0;
            const confidence = message.confidence || 'high';

            // Find matching previous user question for escalation context
            let userQuestionContext = '';
            if (isAssistant) {
              for (let i = index - 1; i >= 0; i--) {
                if (messages[i].sender === 'user') {
                  userQuestionContext = messages[i].content;
                  break;
                }
              }
            }

            return (
              <div
                key={message.id}
                id={`message-${message.id}`}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* Sender Identity & Timestamp */}
                <div
                  className={`flex items-center space-x-2 text-[11px] mb-1.5 px-1 ${
                    isUser ? 'flex-row-reverse space-x-reverse text-slate-500' : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isUser
                        ? 'bg-slate-300 text-slate-700'
                        : 'bg-[#0B3B32] text-emerald-300'
                    }`}
                  >
                    {isUser ? <User className="w-3 h-3" /> : 'IP'}
                  </div>
                  <span className="font-semibold text-slate-800">
                    {isUser ? 'Inquirer' : 'IP-SAKTI Sahayak'}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="font-mono text-[10px]">{message.timestamp}</span>
                </div>

                {/* Message Body Container */}
                <div
                  className={`w-full max-w-2xl rounded-xl border p-4 sm:p-5 shadow-2xs leading-relaxed text-sm ${
                    isUser
                      ? 'bg-white border-slate-200 text-slate-900'
                      : 'bg-white border-teal-900/20 text-slate-800 ring-1 ring-teal-900/5'
                  }`}
                >
                  {/* User Message Rendering */}
                  {isUser && (
                    <div className="space-y-2">
                      <div className="whitespace-pre-line text-slate-900 text-[13.5px]">
                        {message.originalQuestion || message.content}
                      </div>
                      {message.translatedQuery && (
                        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 bg-slate-50/80 p-2 rounded-md">
                          <span className="font-semibold text-slate-700">English Retrieval Query: </span>
                          <span className="italic text-slate-800 font-mono text-[10.5px]">"{message.translatedQuery}"</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assistant Answer Card Structured Rendering */}
                  {isAssistant && (
                    <div className="space-y-4">
                      {/* Dual Jurisdiction Split Rendering */}
                      {message.isDualJurisdiction && message.sections && message.sections.length > 0 ? (
                        <div className="space-y-5">
                          {message.sections.map((section, secIdx) => {
                            const secHasCitations = Boolean(
                              section.citations && section.citations.length > 0
                            );
                            const secConfidence = section.confidence || 'low';

                            return (
                              <div
                                key={`jurisdiction-section-${secIdx}-${section.jurisdiction}`}
                                className={`space-y-3 ${
                                  secIdx > 0 ? 'pt-4 border-t-2 border-dashed border-slate-200' : ''
                                }`}
                              >
                                {/* Section Header: Label + Authority Tag + Section's Own Confidence Badge */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-teal-950 text-[14px]">
                                      {section.sectionLabel ||
                                        (section.jurisdiction === 'india'
                                          ? 'In India:'
                                          : 'Internationally:')}
                                    </span>
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-900 border border-teal-200 font-semibold">
                                      {section.jurisdiction === 'india'
                                        ? 'AYUSH • CDSCO • IPO'
                                        : 'US FDA • EMA • WIPO'}
                                    </span>
                                  </div>

                                  {/* Section Independent Confidence Badge */}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] font-medium text-slate-500">
                                      Confidence:
                                    </span>
                                    {secConfidence === 'high' && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        High
                                      </span>
                                    )}
                                    {secConfidence === 'medium' && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                        Medium
                                      </span>
                                    )}
                                    {secConfidence === 'low' && (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                        Low / Needs verification
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Section Answer with Section-Specific Citations ([1], [2] starting from 1) */}
                                <div className="whitespace-pre-line text-slate-800 text-[13.5px] leading-relaxed">
                                  {renderContentWithInlineCitations(section.answer, section.citations)}
                                </div>

                                {/* Section Cited Statutory Sources */}
                                {secHasCitations && (
                                  <div className="pt-2">
                                    <div className="flex items-center space-x-1.5 text-[11px] font-bold text-teal-950 uppercase tracking-wider mb-2">
                                      <FileText className="w-3.5 h-3.5 text-teal-700" />
                                      <span>
                                        Statutory Sources ({section.jurisdiction === 'india' ? 'India' : 'International'})
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {section.citations.map((citation, cIdx) => (
                                        <button
                                          key={citation.id || `sec-${secIdx}-cite-${citation.number || cIdx}`}
                                          type="button"
                                          onClick={() => onOpenSource?.(citation)}
                                          className="p-2.5 text-left bg-teal-50/50 hover:bg-teal-50/90 rounded-lg border border-teal-200/80 hover:border-teal-400 transition-all text-xs cursor-pointer group shadow-2xs"
                                          title="Click to view statutory authority details and excerpt"
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="font-bold text-teal-950 text-[11px] truncate group-hover:text-teal-800">
                                              {citation.documentTitle || citation.title || citation.actOrBody}
                                            </span>
                                            {citation.number && (
                                              <span className="px-1.5 py-0.2 rounded bg-teal-800/10 text-teal-900 font-mono text-[10px] font-bold">
                                                [{citation.number}]
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-teal-900 font-mono text-[10.5px] mt-0.5 truncate max-w-full font-medium" title={citation.sectionLabel || citation.sectionOrArticle || ''}>
                                            {formatSectionLabel(citation.sectionLabel || citation.sectionOrArticle)}
                                          </div>
                                          {citation.snippet && (
                                            <div className="text-slate-600 text-[10.5px] mt-1 line-clamp-2 italic break-words">
                                              "{citation.snippet.length > 180 ? citation.snippet.slice(0, 177) + '...' : citation.snippet}"
                                            </div>
                                          )}
                                          {citation.hindiParaphrase && (
                                            <div className="text-teal-900 font-sans text-[10.5px] mt-1 bg-teal-100/60 p-1.5 rounded border border-teal-200/80 leading-snug">
                                              <span className="font-semibold text-teal-950">भावार्थ: </span>
                                              <span>{citation.hindiParaphrase}</span>
                                            </div>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Standard Single Jurisdiction Rendering */
                        <>
                          {/* 1. Direct Answer Text with Inline Citation Chips */}
                          <div className="whitespace-pre-line text-slate-800 text-[13.5px] leading-relaxed">
                            {renderContentWithInlineCitations(message.content, message.citations)}
                          </div>

                          {/* Cited Statutory References Chips (Render ONLY if citations array is non-empty) */}
                          {hasCitations && (
                            <div className="pt-3 border-t border-slate-100">
                              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-teal-950 uppercase tracking-wider mb-2">
                                <FileText className="w-3.5 h-3.5 text-teal-700" />
                                <span>Statutory Sources Cited</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {message.citations!.map((citation, cIdx) => (
                                  <button
                                    key={citation.id || `cite-card-${cIdx}`}
                                    type="button"
                                    onClick={() => onOpenSource?.(citation)}
                                    className="p-2.5 text-left bg-teal-50/50 hover:bg-teal-50/90 rounded-lg border border-teal-200/80 hover:border-teal-400 transition-all text-xs cursor-pointer group shadow-2xs"
                                    title="Click to view statutory authority details and excerpt"
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-teal-950 text-[11px] truncate group-hover:text-teal-800">
                                        {citation.documentTitle || citation.title || citation.actOrBody}
                                      </span>
                                      {citation.number && (
                                        <span className="px-1.5 py-0.2 rounded bg-teal-800/10 text-teal-900 font-mono text-[10px] font-bold">
                                          [{citation.number}]
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-teal-900 font-mono text-[10.5px] mt-0.5 truncate max-w-full font-medium" title={citation.sectionLabel || citation.sectionOrArticle || ''}>
                                      {formatSectionLabel(citation.sectionLabel || citation.sectionOrArticle)}
                                    </div>
                                    {citation.snippet && (
                                      <div className="text-slate-600 text-[10.5px] mt-1 line-clamp-2 italic break-words">
                                        "{citation.snippet.length > 180 ? citation.snippet.slice(0, 177) + '...' : citation.snippet}"
                                      </div>
                                    )}
                                    {citation.hindiParaphrase && (
                                      <div className="text-teal-900 font-sans text-[10.5px] mt-1 bg-teal-100/60 p-1.5 rounded border border-teal-200/80 leading-snug">
                                        <span className="font-semibold text-teal-950">भावार्थ: </span>
                                        <span>{citation.hindiParaphrase}</span>
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Confidence Badge (Single Jurisdiction) */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                Confidence Assessment:
                              </span>
                              {confidence === 'high' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  High
                                </span>
                              )}
                              {confidence === 'medium' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  Medium
                                </span>
                              )}
                              {confidence === 'low' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                  Low / Needs verification
                                </span>
                              )}
                            </div>

                            {message.shouldEscalate && (
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
                                Attorney review flagged
                              </span>
                            )}
                          </div>
                        </>
                      )}

                      {/* 3. Caveats Line */}
                      <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200/80 text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">Advisory Caveat: </span>
                        <span>
                          Statutory guidance for informational evaluation; verify against current gazette notifications before regulatory filing.
                        </span>
                        {confidence === 'medium' && (
                          <span className="text-amber-900 font-medium">
                            {' '}• Note: Limited source density or partial statutory overlap. Cross-reference with licensing officer or classical formulary.
                          </span>
                        )}
                        {confidence === 'low' && (
                          <span className="text-rose-900 font-medium">
                            {' '}• Note: Knowledge base gap or unverified assertions detected. Direct review with an Ayush patent facilitator recommended.
                          </span>
                        )}
                      </div>

                      {/* 4. Actions Row */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleFocusInput}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-teal-500 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs shadow-2xs transition-colors cursor-pointer"
                          >
                            <CornerDownRight className="w-3.5 h-3.5 text-teal-800" />
                            <span>Ask a follow-up</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onOpenEscalation?.(userQuestionContext || message.content)
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-teal-200 hover:border-teal-400 bg-teal-50/70 hover:bg-teal-100 text-teal-900 font-medium text-xs shadow-2xs transition-colors cursor-pointer"
                          >
                            <UserCheck className="w-3.5 h-3.5 text-teal-800" />
                            <span>Talk to a human facilitator</span>
                          </button>
                        </div>

                        {/* Thumbs Up / Down Feedback Controls */}
                        <div className="flex items-center space-x-1 text-slate-400 border border-slate-200 rounded-lg p-1 bg-white">
                          <button
                            type="button"
                            onClick={() => onFeedback?.(message.id, 'up')}
                            className={`p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer ${
                              message.feedback === 'up'
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                            title="Helpful statutory guidance"
                            aria-label="Thumbs up"
                          >
                            <ThumbsUp
                              className={`w-3.5 h-3.5 ${
                                message.feedback === 'up' ? 'fill-emerald-600' : ''
                              }`}
                            />
                          </button>
                          <div className="w-px h-3 bg-slate-200" />
                          <button
                            type="button"
                            onClick={() => onFeedback?.(message.id, 'down')}
                            className={`p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer ${
                              message.feedback === 'down'
                                ? 'text-rose-700 bg-rose-50'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                            title="Needs revision or clarification"
                            aria-label="Thumbs down"
                          >
                            <ThumbsDown
                              className={`w-3.5 h-3.5 ${
                                message.feedback === 'down' ? 'fill-rose-600' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading State: Checking authoritative sources... */}
          {isLoading && (
            <div className="flex items-start space-x-3 max-w-2xl animate-fade-in">
              <div className="w-6 h-6 rounded-full bg-[#0B3B32] flex items-center justify-center text-white shrink-0 shadow-xs">
                <Scale className="w-3.5 h-3.5 text-emerald-300" />
              </div>
              <div className="p-4 bg-white border border-teal-900/20 rounded-xl rounded-tl-sm shadow-2xs flex items-center space-x-3 text-slate-700 text-xs">
                <Loader2 className="w-4 h-4 text-teal-800 animate-spin" />
                <span className="text-teal-950 font-medium">
                  Checking authoritative sources...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Console at Bottom */}
      <div
        id="chat-input-section"
        className="p-4 sm:p-5 bg-white border-t border-slate-200"
      >
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto relative flex flex-col space-y-2"
        >
          <div className="relative flex items-center">
            <textarea
              ref={textareaRef}
              id="chat-input-textarea"
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isChatActive || isLoading}
              placeholder={
                isLoading
                  ? 'Checking authoritative gazettes & evaluating regulatory citations...'
                  : !isChatActive
                  ? 'Complete onboarding setup above to activate IP-SAKTI Sahayak console...'
                  : language === 'Hindi'
                  ? 'आयुर्वेदिक उत्पाद का नाम, घटक या विनियामक प्रश्न यहाँ दर्ज करें...'
                  : 'Enter Ayurvedic product name, ingredients, or IP query (e.g. "Can I patent an extraction of Guduchi?")...'
              }
              className={`w-full resize-none rounded-xl border p-3.5 pr-14 text-sm outline-none transition-all shadow-inner ${
                !isChatActive || isLoading
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-slate-300 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 text-slate-800 placeholder:text-slate-400'
              }`}
            />
            <button
              id="send-chat-button"
              type="submit"
              disabled={!isChatActive || !inputValue.trim() || isLoading}
              className="absolute right-3 bottom-3 p-2 rounded-lg bg-[#0B3B32] hover:bg-[#125447] disabled:bg-slate-200 text-white disabled:text-slate-400 transition-colors cursor-pointer disabled:cursor-not-allowed shadow-xs"
              aria-label="Submit Query"
              title="Submit Query"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-300" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          {!isChatActive && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
              <span className="font-medium">
                Workspace initialization required before starting consultation.
              </span>
              {onOpenOnboarding && (
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="font-bold underline text-teal-800 hover:text-teal-950 cursor-pointer"
                >
                  Complete Setup
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-teal-800" />
              <span>Ayush Regulatory Shell • Press Enter to submit question</span>
            </span>
            <span className="font-mono text-[10px]">
              Jurisdiction: {jurisdiction}
            </span>
          </div>
        </form>
      </div>
    </main>
  );
};
