/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { TopBar } from './components/TopBar';
import { LeftRail } from './components/LeftRail';
import { ChatThread } from './components/ChatThread';
import { RightRail } from './components/RightRail';
import { LegalDisclaimerModal } from './components/LegalDisclaimerModal';
import { OnboardingModal } from './components/OnboardingModal';
import { DatabaseStatusModal } from './components/DatabaseStatusModal';
import { EscalationModal } from './components/EscalationModal';
import { SourceViewerModal } from './components/SourceViewerModal';
import { ProductClassificationModal } from './components/ProductClassificationModal';
import {
  Jurisdiction,
  Language,
  ChatMessage,
  ProductClassificationSummary,
  ClassifyProductFormData,
  SourceCitation,
} from './types';

// Lazy-loaded: AdminPortal pulls in pdfjs-dist and mammoth for document
// ingestion, which are only needed by admins, not the general chat audience.
// Code-splitting this keeps the main chat bundle lean.
const AdminPortal = lazy(() =>
  import('./components/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);

/**
 * Extracts the first sentence or two from an assistant answer text
 * to construct clean prior context for recentMessages.
 */
function extractFirstSentences(text: string, count: number = 2): string {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, count).join(' ').trim();
}

/**
 * Merges newly cited sources into the session-level running list:
 * - Deduplicated by document_id (or documentTitle).
 * - A document with multiple chunks in one answer counts once for that turn.
 * - Increments timesCited counter if already present.
 * - Records citedChunks array so the slide-over panel can default to the most recently cited chunk
 *   and step through all cited chunks.
 */
function mergeSessionSources(
  existingSources: SourceCitation[],
  newCitations: SourceCitation[]
): SourceCitation[] {
  if (!newCitations || newCitations.length === 0) {
    return existingSources;
  }

  // Group citations by document
  const docToCitations = new Map<string, SourceCitation[]>();
  for (const c of newCitations) {
    const key = c.document_id || c.documentTitle || c.title || c.id;
    if (!docToCitations.has(key)) {
      docToCitations.set(key, []);
    }
    docToCitations.get(key)!.push(c);
  }

  const updated = [...existingSources];

  docToCitations.forEach((citationsForDoc, key) => {
    const mostRecentCitation = citationsForDoc[citationsForDoc.length - 1];
    const existingIndex = updated.findIndex(
      (s) => (s.document_id || s.documentTitle || s.title || s.id) === key
    );

    const newChunkInfos = citationsForDoc.map((c) => ({
      chunk_id: c.chunk_id || c.id,
      sectionLabel: c.sectionLabel || c.sectionOrArticle,
      snippet: c.snippet,
      hindiParaphrase: c.hindiParaphrase,
      fullText: c.fullText,
      citedSentence: c.citedSentence,
      timestamp: new Date().toISOString(),
    }));

    if (existingIndex >= 0) {
      const existing = updated[existingIndex];
      const existingChunks = existing.citedChunks ? [...existing.citedChunks] : [];

      // Append new chunk infos, deduplicating by chunk_id
      for (const nc of newChunkInfos) {
        const foundIdx = existingChunks.findIndex((ch) => ch.chunk_id === nc.chunk_id);
        if (foundIdx >= 0) {
          existingChunks.splice(foundIdx, 1);
        }
        existingChunks.push(nc);
      }

      updated[existingIndex] = {
        ...existing,
        timesCited: (existing.timesCited || 1) + 1,
        snippet: mostRecentCitation.snippet || existing.snippet,
        hindiParaphrase: mostRecentCitation.hindiParaphrase || existing.hindiParaphrase,
        fullText: mostRecentCitation.fullText || existing.fullText,
        sectionLabel: mostRecentCitation.sectionLabel || existing.sectionLabel,
        chunk_id: mostRecentCitation.chunk_id || existing.chunk_id,
        citedSentence: mostRecentCitation.citedSentence || existing.citedSentence,
        sourceUrl: mostRecentCitation.sourceUrl || existing.sourceUrl,
        citedChunks: existingChunks,
      };
    } else {
      updated.push({
        ...mostRecentCitation,
        timesCited: 1,
        citedChunks: newChunkInfos,
      });
    }
  });

  return updated;
}

export default function App() {
  // Simple Path Routing (/ and /admin)
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/admin') || window.location.hash === '#/admin') {
        return '/admin';
      }
    }
    return '/';
  });

  // Listen for browser navigation / history changes and keyboard shortcut (Alt+A)
  useEffect(() => {
    const handleLocationChange = () => {
      if (
        window.location.pathname.startsWith('/admin') ||
        window.location.hash === '#/admin' ||
        window.location.hash === '#admin'
      ) {
        setCurrentPath('/admin');
      } else {
        setCurrentPath('/');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.key === 'a') || (e.ctrlKey && e.shiftKey && e.key === 'A')) {
        e.preventDefault();
        const next = currentPath === '/admin' ? '/' : '/admin';
        try {
          window.history.pushState(null, '', next);
        } catch {
          // ignore
        }
        window.location.hash = next === '/admin' ? '#/admin' : '';
        setCurrentPath(next);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPath]);

  const navigateTo = (path: string) => {
    try {
      window.history.pushState(null, '', path);
    } catch {
      // ignore
    }
    if (path === '/admin') {
      window.location.hash = '#/admin';
    } else if (window.location.hash.includes('admin')) {
      window.location.hash = '';
    }
    setCurrentPath(path);
  };

  // Conversation tracking & persistent identifier
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());

  // Global Workspace Configuration
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('India');
  const [language, setLanguage] = useState<Language>('English');
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(true);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState<boolean>(false);
  const [isDbStatusOpen, setIsDbStatusOpen] = useState<boolean>(false);

  // Responsive Drawer / Mobile Sheet States
  const [isMobileLeftRailOpen, setIsMobileLeftRailOpen] = useState<boolean>(false);
  const [isMobileRightRailOpen, setIsMobileRightRailOpen] = useState<boolean>(false);

  // Modals & Viewers
  const [isEscalationOpen, setIsEscalationOpen] = useState<boolean>(false);
  const [escalationQuestion, setEscalationQuestion] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<SourceCitation | null>(null);
  const [isSourceViewerOpen, setIsSourceViewerOpen] = useState<boolean>(false);

  // Guided Product Classification Flow (Prompt 8)
  const [isClassificationModalOpen, setIsClassificationModalOpen] = useState<boolean>(false);
  const [isSubmittingClassification, setIsSubmittingClassification] = useState<boolean>(false);
  const [pendingQuestionAfterClassification, setPendingQuestionAfterClassification] = useState<string | null>(null);
  const [initialClassificationFormData, setInitialClassificationFormData] = useState<ClassifyProductFormData | null>(null);

  // Loading indicator for active RAG query
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Initial welcome message factory (re-used on mount AND on conversation reset,
  // with a freshly computed timestamp each time it's invoked)
  const buildInitialMessages = (): ChatMessage[] => [
    {
      id: 'welcome-init-msg',
      sender: 'assistant',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content:
        'Namaste. I am IP-SAKTI Sahayak, an AI guidance system for Ayurvedic Intellectual Property and statutory compliance across Indian (AYUSH/CDSCO/IPO) and international regulatory regimes.\n\nYou may ask questions regarding patentability exclusions under Section 3(p), classical vs proprietary licensing under Rule 158B, Schedule E(1) poisonous botanical controls, or select a quick-start guidance prompt from the left navigator.',
      confidence: 'high',
    },
  ];

  const [messages, setMessages] = useState<ChatMessage[]>(buildInitialMessages);

  // Empty state by default for Product Classification ("Not yet classified")
  const [classification, setClassification] = useState<ProductClassificationSummary>({
    isClassified: false,
  });

  // Empty state by default for Sources ("No sources yet")
  const [sources, setSources] = useState<SourceCitation[]>([]);

  // Initialize conversation row (only when the conversation identity itself changes,
  // e.g. on mount or after a reset) — not on every jurisdiction/language chip toggle
  useEffect(() => {
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conversationId,
        jurisdiction: jurisdiction.toLowerCase(),
        language,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Sync jurisdiction/language chip changes to the existing conversation row,
  // separately from the initial registration above
  const isFirstJurisdictionLanguageSync = useRef(true);
  useEffect(() => {
    if (isFirstJurisdictionLanguageSync.current) {
      isFirstJurisdictionLanguageSync.current = false;
      return;
    }
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conversationId,
        jurisdiction: jurisdiction.toLowerCase(),
        language,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jurisdiction, language]);

  // Toggles for chips
  const handleToggleJurisdiction = () => {
    setJurisdiction((prev) => (prev === 'India' ? 'International' : 'India'));
  };

  const handleToggleLanguage = () => {
    setLanguage((prev) => (prev === 'English' ? 'Hindi' : 'English'));
  };

  // Wire Conversation Reset Button:
  // 1. Clear chat thread
  // 2. Start a new conversation row (new conversation_id) in conversations table
  // 3. Reset right-rail "Product classification" back to "Not yet classified"
  // 4. Reset right-rail "Sources used" back to "No sources yet"
  // 5. Clear any in-memory cache for the old conversation
  // 6. Keep already-selected Jurisdiction and Language chips as they are
  const handleResetConversation = async () => {
    const oldConvId = conversationId;
    const newConvId = crypto.randomUUID();

    // Clear old conversation cache (Prompt 13 cache requirement)
    if (oldConvId) {
      fetch('/api/conversations/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: oldConvId }),
      }).catch(() => {});
    }

    // Register new conversation row
    fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newConvId,
        jurisdiction: jurisdiction.toLowerCase(),
        language,
        classification_result: null,
        messages: [],
      }),
    }).catch(() => {});

    setConversationId(newConvId);
    setMessages(buildInitialMessages());
    setClassification({ isClassified: false });
    setSources([]);
    setPendingQuestionAfterClassification(null);
    setInitialClassificationFormData(null);
    setIsMobileLeftRailOpen(false);
  };

  // Open Source Viewer modal
  const handleOpenSource = useCallback((source: SourceCitation) => {
    setSelectedSource(source);
    setIsSourceViewerOpen(true);
  }, []);

  // Open Escalation modal
  const handleOpenEscalation = useCallback((questionSummary: string) => {
    setEscalationQuestion(questionSummary);
    setIsEscalationOpen(true);
  }, []);

  // Silent Feedback submission to /api/feedback
  const handleFeedback = async (messageId: string, rating: 'up' | 'down') => {
    // Immediate visual update on the message card
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m))
    );

    // Silent background insertion into feedback table
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: messageId,
          rating,
        }),
      });
    } catch (err) {
      console.warn('[Feedback] Background feedback recording error:', err);
    }
  };

  // Helper to execute backend Question Answering call via /api/ask-question
  const runAskQuestion = async (
    questionText: string,
    activeClassification: ProductClassificationSummary | null
  ) => {
    setIsLoading(true);

    // Calculate recentMessages from previous turn (last user question & assistant answer excerpt)
    let recentMessages: any = null;
    let lastUserQ = '';
    let lastAsstA = '';

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'assistant' && !lastAsstA) {
        lastAsstA = messages[i].content;
      } else if (messages[i].sender === 'user' && !lastUserQ) {
        lastUserQ = messages[i].content;
      }
      if (lastUserQ && lastAsstA) break;
    }

    if (lastUserQ && lastAsstA) {
      recentMessages = [
        { sender: 'user', content: lastUserQ },
        { sender: 'assistant', content: extractFirstSentences(lastAsstA, 2) },
      ];
    }

    try {
      const response = await fetch('/api/ask-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          jurisdiction: jurisdiction.toLowerCase(),
          language,
          classification: activeClassification?.isClassified ? activeClassification : null,
          recentMessages,
          conversation_id: conversationId,
        }),
      });

      const data = await response.json();

      const assistantMsgId = crypto.randomUUID();
      const newAssistantMessage: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content:
          data.answer ||
          "I don't have a reliable, cited answer to this specific question in my current knowledge base.",
        citations: data.citations || [],
        confidence: data.confidence || 'low',
        shouldEscalate: Boolean(data.shouldEscalate),
        isDualJurisdiction: Boolean(data.isDualJurisdiction),
        sections: data.sections || undefined,
      };

      setMessages((prev) => {
        // If query was translated from Hindi, update user turn message to keep original Hindi and English query
        let updated = prev;
        if (data.translatedQuery) {
          updated = prev.map((msg) =>
            msg.sender === 'user' && msg.content === questionText
              ? {
                  ...msg,
                  originalQuestion: data.originalQuestion || questionText,
                  translatedQuery: data.translatedQuery,
                }
              : msg
          );
        }
        return [...updated, newAssistantMessage];
      });

      // If citations array is non-empty, merge into session-level running list
      if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
        setSources((prev) => mergeSessionSources(prev, data.citations));
      }

      // NOTE: We intentionally do NOT auto-open the Escalation modal here.
      // With an empty/sparse knowledge base, virtually every query returns
      // shouldEscalate: true, which previously popped the modal over the
      // answer before the user could even read it. The inline "Attorney
      // review flagged" badge on the message (see ChatThread) plus the
      // manual "Talk to a facilitator" action (handleOpenEscalation) give
      // the user control over when to escalate instead.
    } catch (err: any) {
      console.error('[App] askQuestion error:', err);
      const assistantMsgId = crypto.randomUUID();
      const errorMessage: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content:
          "I don't have a reliable, cited answer to this specific question in my current knowledge base.",
        citations: [],
        confidence: 'low',
        shouldEscalate: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setEscalationQuestion(questionText);
      setIsEscalationOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  // User chat input handler with automatic product intent detection (Prompt 8)
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const trimmedText = text.trim();
    const userMsgId = crypto.randomUUID();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newUserMessage: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      timestamp: timeStr,
      content: trimmedText,
    };

    setMessages((prev) => [...prev, newUserMessage]);

    // Check automatic classification condition:
    // "no classification is currently stored for this conversation yet,
    // AND the user's question mentions a specific product/formulation rather than a general legal question —
    // check this with one small, cheap Gemini call before running askQuestion"
    if (!classification.isClassified) {
      setIsLoading(true);
      let proceedingToAskQuestion = true;
      try {
        const intentRes = await fetch('/api/check-product-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: trimmedText }),
        });
        const intentData = await intentRes.json();

        if (intentData?.intent === 'product') {
          // Pause and show the guided classification form before calling askQuestion
          proceedingToAskQuestion = false;
          setIsLoading(false);
          setPendingQuestionAfterClassification(trimmedText);
          setInitialClassificationFormData(null);
          setIsClassificationModalOpen(true);
          return;
        }
      } catch (intentErr) {
        console.warn('[App] Intent check error, proceeding to askQuestion:', intentErr);
      } finally {
        // Only clear isLoading here if we're NOT about to immediately call
        // runAskQuestion below, which sets isLoading(true) again right away.
        // Otherwise this creates a brief true -> false -> true UI flicker.
        if (!proceedingToAskQuestion) {
          setIsLoading(false);
        }
      }
    }

    // If general or already classified, proceed straight to askQuestion as normal
    await runAskQuestion(trimmedText, classification.isClassified ? classification : null);
  };

  // Open Product Classification Modal (manual trigger or edit action)
  const handleOpenClassification = (isEdit: boolean = false) => {
    if (isEdit && classification.rawInputs) {
      setInitialClassificationFormData(classification.rawInputs);
    } else {
      setInitialClassificationFormData(null);
    }
    setPendingQuestionAfterClassification(null);
    setIsClassificationModalOpen(true);
  };

  // Dismiss / Close Product Classification Modal
  const handleCloseClassificationModal = () => {
    setIsClassificationModalOpen(false);
    if (pendingQuestionAfterClassification) {
      const q = pendingQuestionAfterClassification;
      setPendingQuestionAfterClassification(null);
      runAskQuestion(q, null);
    }
  };

  // Handle Submission of Product Classification Form
  const handleClassificationSubmit = async (formData: ClassifyProductFormData) => {
    setIsSubmittingClassification(true);
    try {
      const response = await fetch('/api/classify-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          conversation_id: conversationId,
        }),
      });

      const data = await response.json();
      const res = data.classification || data;
      if (!res || !res.categoryName) {
        throw new Error(data.error || 'Classification failed.');
      }
      const newClassification: ProductClassificationSummary = {
        productName: formData.productNameOrDescription,
        categoryName: res.categoryName,
        categoryDefinition: res.categoryDefinition,
        regulatoryPathway: res.regulatoryPathway,
        confidence: res.confidence,
        clarifyingQuestion: res.clarifyingQuestion,
        rawInputs: formData,
        ayurvedicCategory: res.categoryName,
        regulatoryRegime: res.regulatoryPathway,
        isClassified: true,
      };

      setClassification(newClassification);
      setIsClassificationModalOpen(false);

      // Add a helpful assistant confirmation message in chat
      const asstMsgId = crypto.randomUUID();
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const confirmationMsg: ChatMessage = {
        id: asstMsgId,
        sender: 'assistant',
        timestamp: timeStr,
        content: `**Product Classification Recorded:**\n- **Category:** ${res.categoryName}\n- **Definition:** ${res.categoryDefinition}\n- **Regulatory Pathway:** ${res.regulatoryPathway}${res.clarifyingQuestion ? `\n- *Clarification Point:* ${res.clarifyingQuestion}` : ''}`,
        confidence: res.confidence || 'high',
      };
      setMessages((prev) => [...prev, confirmationMsg]);

      // If triggered by a pending question, proceed to answer it with the newly stored classification
      if (pendingQuestionAfterClassification) {
        const q = pendingQuestionAfterClassification;
        setPendingQuestionAfterClassification(null);
        await runAskQuestion(q, newClassification);
      }
    } finally {
      setIsSubmittingClassification(false);
    }
  };

  // Quick prompt selection handler
  const handleSelectPrompt = (promptText: string) => {
    setIsMobileLeftRailOpen(false);
    if (promptText === 'Classify my product') {
      handleOpenClassification(false);
      return;
    }

    // Call real backend askQuestion with the selected prompt
    handleSendMessage(promptText);
  };

  const handleCompleteOnboarding = (
    chosenJurisdiction: Jurisdiction,
    chosenLanguage: Language
  ) => {
    setJurisdiction(chosenJurisdiction);
    setLanguage(chosenLanguage);
    setIsOnboardingCompleted(true);
    setIsOnboardingOpen(false);
  };

  // If on /admin route or hash, render the AdminPortal after all hooks have executed unconditionally
  if (currentPath === '/admin') {
    return (
      <Suspense
        fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-[#F6F8F7] text-slate-500 text-sm">
            Loading admin portal…
          </div>
        }
      >
        <AdminPortal
          onNavigateHome={() => navigateTo('/')}
          onSessionChange={() => {
            // Trigger re-render to update TopBar and LeftRail admin badges
            setCurrentPath('/admin');
          }}
        />
      </Suspense>
    );
  }

  return (
    <div
      id="app-root-workspace"
      className="h-screen w-screen flex flex-col bg-[#F6F8F7] text-slate-900 overflow-hidden"
    >
      {/* 1. Top Bar */}
      <TopBar
        jurisdiction={jurisdiction}
        onToggleJurisdiction={handleToggleJurisdiction}
        language={language}
        onToggleLanguage={handleToggleLanguage}
        onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
        onOpenDbStatus={() => setIsDbStatusOpen(true)}
        onOpenAdmin={() => navigateTo('/admin')}
        onToggleMobileLeftRail={() => setIsMobileLeftRailOpen((prev) => !prev)}
        onToggleMobileRightRail={() => setIsMobileRightRailOpen((prev) => !prev)}
        isMobileRightRailOpen={isMobileRightRailOpen}
      />

      {/* 2. Workspace Body: Left Rail + Main Chat Panel + Right Rail */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Rail */}
        <LeftRail
          onResetConversation={handleResetConversation}
          onSelectPrompt={handleSelectPrompt}
          onOpenClassifyProduct={() => handleOpenClassification(false)}
          onOpenAdmin={() => navigateTo('/admin')}
          isOpenMobile={isMobileLeftRailOpen}
          onCloseMobile={() => setIsMobileLeftRailOpen(false)}
          jurisdiction={jurisdiction}
          language={language}
        />

        {/* Main Panel: Chat Thread */}
        <ChatThread
          messages={messages}
          onSendMessage={handleSendMessage}
          jurisdiction={jurisdiction}
          language={language}
          onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
          isChatActive={isOnboardingCompleted}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          isLoading={isLoading}
          onOpenSource={handleOpenSource}
          onOpenEscalation={handleOpenEscalation}
          onFeedback={handleFeedback}
        />

        {/* Right Rail: Product Classification & Sources */}
        <RightRail
          classification={classification}
          sources={sources}
          isOpenMobile={isMobileRightRailOpen}
          onCloseMobile={() => setIsMobileRightRailOpen(false)}
          language={language}
          onOpenSource={handleOpenSource}
          onEditClassification={() => handleOpenClassification(true)}
          onOpenClassifyProduct={() => handleOpenClassification(false)}
        />
      </div>

      {/* Standing Legal Disclaimer Dialog */}
      <LegalDisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
        language={language}
      />

      {/* Database Schema & Status Modal */}
      <DatabaseStatusModal
        isOpen={isDbStatusOpen}
        onClose={() => setIsDbStatusOpen(false)}
      />

      {/* First-Run Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen && !isOnboardingCompleted}
        onComplete={handleCompleteOnboarding}
        initialJurisdiction={jurisdiction}
        initialLanguage={language}
      />

      {/* Facilitator Escalation Modal */}
      <EscalationModal
        isOpen={isEscalationOpen}
        onClose={() => setIsEscalationOpen(false)}
        conversationId={conversationId}
        questionSummary={
          escalationQuestion ||
          [...messages].reverse().find((m) => m.sender === 'user')?.content ||
          ''
        }
        classification={classification}
        language={language}
      />

      {/* Authoritative Source & Excerpt Viewer Modal */}
      <SourceViewerModal
        isOpen={isSourceViewerOpen}
        onClose={() => setIsSourceViewerOpen(false)}
        source={selectedSource}
      />

      {/* Guided Product Classification Modal (Prompt 8) */}
      <ProductClassificationModal
        isOpen={isClassificationModalOpen}
        onClose={handleCloseClassificationModal}
        onSubmit={handleClassificationSubmit}
        initialData={initialClassificationFormData}
        pendingQuestion={pendingQuestionAfterClassification}
        isSubmitting={isSubmittingClassification}
      />
    </div>
  );
}
