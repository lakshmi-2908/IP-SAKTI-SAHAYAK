import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as mammoth from 'mammoth';
import {
  ShieldAlert,
  KeyRound,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  FolderUp,
  ChevronRight,
  Database,
  ArrowLeft,
  RefreshCw,
  Check,
  Edit3,
  Scale,
  BookOpen,
  Info,
  Layers,
  FileCheck,
  PowerOff,
  Search,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Filter,
  Calendar,
  Globe,
  Languages,
  Trash2,
  Eye,
  EyeOff,
  LogOut,
  Lock,
} from 'lucide-react';

// Configure the pdf.js worker (bundled by Vite as a static asset URL)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface MetadataSuggestion {
  jurisdiction: 'india' | 'international';
  jurisdictionReason: string;
  category: 'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL';
  categoryReason: string;
  language: string;
  languageReason: string;
  title: string | null;
  titleReason: string;
  authority: string | null;
  authorityReason: string;
  source_url: string | null;
  sourceUrlReason: string;
}

interface QueuedFile {
  name: string;
  size: number;
  rawText: string;
}

interface IngestedDoc {
  id: string;
  title: string;
  authority: string | null;
  jurisdiction: 'india' | 'international';
  category: string;
  language: string;
  source_url: string | null;
  upload_date: string;
  status: 'active' | 'deactivated';
  chunk_count: number;
}

export interface AdminPortalProps {
  onNavigateHome: () => void;
  onSessionChange?: (active: boolean) => void;
}

// Strictly session-bound session management (lives in sessionStorage only, purged on tab/browser close)
const getStoredSessionToken = (): string => {
  try {
    // Purge any legacy localStorage keys to ensure zero credential leakage
    localStorage.removeItem('ipsakti_admin_passcode');
    localStorage.removeItem('ipsakti_admin_authenticated');
    localStorage.removeItem('ipsakti_admin_session_token');
    return sessionStorage.getItem('ipsakti_admin_session_token') || '';
  } catch {
    return '';
  }
};

const getStoredPasscode = (): string => {
  try {
    return sessionStorage.getItem('ipsakti_admin_passcode') || '';
  } catch {
    return '';
  }
};

const getStoredIsAuthenticated = (): boolean => {
  try {
    return (
      sessionStorage.getItem('ipsakti_admin_authenticated') === 'true' &&
      (!!sessionStorage.getItem('ipsakti_admin_session_token') ||
        !!sessionStorage.getItem('ipsakti_admin_passcode'))
    );
  } catch {
    return false;
  }
};

export const AdminPortal: React.FC<AdminPortalProps> = ({ onNavigateHome, onSessionChange }) => {
  // Multi-step Authentication State:
  // Step 1: Master Administrative Passcode
  // Step 2: Statutory Authority & Security PIN Verification Challenge
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [securityPin, setSecurityPin] = useState<string>('');
  const [authorityDeclaration, setAuthorityDeclaration] = useState<boolean>(true);

  const [passcode, setPasscode] = useState<string>(() => getStoredPasscode());
  const [sessionToken, setSessionToken] = useState<string>(() => getStoredSessionToken());
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getStoredIsAuthenticated());
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Helper to retrieve auth headers (both session token and passcode for maximum reliability)
  const getAuthHeaders = (): Record<string, string> => {
    const token = sessionToken || getStoredSessionToken();
    const code = passcode.trim() || getStoredPasscode();
    const headers: Record<string, string> = {};
    if (token) {
      headers['x-admin-session-token'] = token;
    }
    if (code) {
      headers['x-admin-passcode'] = code;
    }
    return headers;
  };

  // Safe logout function that completely terminates the session and invalidates on server
  const handleLogout = async () => {
    const token = sessionToken || getStoredSessionToken();
    if (token) {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: token }),
        }).catch(() => {});
      } catch {
        // ignore
      }
    }
    try {
      sessionStorage.removeItem('ipsakti_admin_authenticated');
      sessionStorage.removeItem('ipsakti_admin_session_token');
      sessionStorage.removeItem('ipsakti_admin_passcode');
      localStorage.removeItem('ipsakti_admin_authenticated');
      localStorage.removeItem('ipsakti_admin_session_token');
      localStorage.removeItem('ipsakti_admin_passcode');
    } catch {
      // ignore
    }
    setSessionToken('');
    setPasscode('');
    setChallengeToken('');
    setAuthStep(1);
    setIsAuthenticated(false);
    setAuthError(null);
    if (onSessionChange) {
      onSessionChange(false);
    }
  };

  // Session expiry / auth failure handler
  const handleAuthFailure = (message?: string) => {
    handleLogout();
    setAuthError(
      message || 'Your administrative session has expired. Please authenticate to continue.'
    );
  };

  // Ingestion metrics
  const [stats, setStats] = useState<{
    totalDocuments: number;
    activeDocuments?: number;
    deactivatedDocuments?: number;
    totalChunks: number;
    tagsCorrected: number;
    embeddingDimension: number;
    allDocuments?: IngestedDoc[];
    recentDocuments: IngestedDoc[];
  }>({
    totalDocuments: 0,
    activeDocuments: 0,
    deactivatedDocuments: 0,
    totalChunks: 0,
    tagsCorrected: 0,
    embeddingDimension: 768,
    allDocuments: [],
    recentDocuments: [],
  });

  // Comprehensive Documents Table state
  const [documents, setDocuments] = useState<IngestedDoc[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Table filtering and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [jurisdictionFilter, setJurisdictionFilter] = useState<'all' | 'india' | 'international'>('all');

  // Queue and Review Flow
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState<string | null>(null);

  // Active Document Form & Suggestions
  const [suggestion, setSuggestion] = useState<MetadataSuggestion | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedAuthority, setEditedAuthority] = useState('');
  const [editedJurisdiction, setEditedJurisdiction] = useState<'india' | 'international'>('india');
  const [editedCategory, setEditedCategory] = useState<'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL'>('patent');
  const [editedLanguage, setEditedLanguage] = useState('English');
  const [editedSourceUrl, setEditedSourceUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Fetch all rows from the "documents" table
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch('/api/admin/documents', {
        headers: { ...getAuthHeaders() },
      });
      if (res.status === 401) {
        handleAuthFailure();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.documents && Array.isArray(data.documents)) {
          setDocuments(data.documents);
        }
      }
    } catch (e) {
      console.error('Failed to fetch documents', e);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // Load stats once authenticated
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { ...getAuthHeaders() },
      });
      if (res.status === 401) {
        handleAuthFailure();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  // Toggle document status (Soft Delete: 'active' <-> 'deactivated', never deletes document or chunks)
  const handleToggleStatus = async (doc: IngestedDoc) => {
    if (togglingId) return;
    const targetStatus: 'active' | 'deactivated' =
      doc.status === 'active' ? 'deactivated' : 'active';

    setTogglingId(doc.id);
    setStatusFeedback(null);

    // Optimistic UI state update
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: targetStatus } : d))
    );

    try {
      const res = await fetch(`/api/admin/documents/${encodeURIComponent(doc.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (res.status === 401) {
        handleAuthFailure();
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update document status.');
      }

      // Synchronize confirmed status
      if (data.document) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, status: data.document.status } : d))
        );
      }

      setStatusFeedback({
        type: 'success',
        message:
          targetStatus === 'deactivated'
            ? `Soft deleted "${doc.title}": Status updated to 'deactivated'. Chunks & vectors remain preserved in the database.`
            : `Reactivated "${doc.title}": Status updated to 'active'. Document is now active in RAG query retrieval.`,
      });

      // Refresh overview stats
      fetchStats();
    } catch (err: any) {
      // Revert optimistic update on failure
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: doc.status } : d))
      );
      setStatusFeedback({
        type: 'error',
        message: `Failed to update document status: ${err.message}`,
      });
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchDocuments();
    }
  }, [isAuthenticated]);

  // Multi-step Authentication Handlers:
  // Step 1: Submit master passcode to receive cryptographic challenge
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPasscode = passcode.trim();
    if (!cleanPasscode) {
      setAuthError('Please enter the administrative passcode.');
      return;
    }
    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/auth/step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: cleanPasscode }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setAuthStep(2);
        setAuthError(null);
      } else {
        setAuthError(data.message || 'Invalid administrative passcode.');
      }
    } catch (err: any) {
      setAuthError('Connection error while contacting authentication gateway.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 2: Submit security verification challenge & statutory authority declaration
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorityDeclaration) {
      setAuthError('You must confirm the statutory compliance declaration to proceed.');
      return;
    }
    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/auth/step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken,
          securityPin: securityPin.trim(),
          authorityDeclaration: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.sessionToken) {
        const cleanPasscode = passcode.trim();
        // Strictly session-bound: stored exclusively in sessionStorage (purged on tab/window close)
        try {
          sessionStorage.setItem('ipsakti_admin_authenticated', 'true');
          sessionStorage.setItem('ipsakti_admin_session_token', data.sessionToken);
          sessionStorage.setItem('ipsakti_admin_passcode', cleanPasscode);

          // Purge localStorage to prevent credential leakage
          localStorage.removeItem('ipsakti_admin_authenticated');
          localStorage.removeItem('ipsakti_admin_session_token');
          localStorage.removeItem('ipsakti_admin_passcode');
        } catch {
          // ignore
        }

        setSessionToken(data.sessionToken);
        setIsAuthenticated(true);
        setAuthError(null);
        if (onSessionChange) {
          onSessionChange(true);
        }
        fetchStats();
        fetchDocuments();
      } else {
        setAuthError(data.message || 'Security verification failed.');
      }
    } catch (err: any) {
      setAuthError('Security verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Run suggestMetadata on the active file in queue
  const analyzeCurrentFile = async (file: QueuedFile) => {
    setIsAnalyzing(true);
    setSuggestion(null);
    setIngestionMessage(null);

    try {
      const res = await fetch('/api/admin/suggest-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ rawText: file.rawText }),
      });

      if (res.status === 401) {
        handleAuthFailure();
        return;
      }

      if (!res.ok) {
        throw new Error(`Model analysis failed: ${res.statusText}`);
      }

      const data: MetadataSuggestion = await res.json();
      setSuggestion(data);

      // Populate form controls with suggestions
      setEditedTitle(data.title || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      setEditedAuthority(data.authority || '');
      setEditedJurisdiction(data.jurisdiction);
      setEditedCategory(data.category);
      setEditedLanguage(data.language);
      setEditedSourceUrl(data.source_url || '');
    } catch (err: any) {
      console.error('Analysis error:', err);
      // Fallback proposal
      setEditedTitle(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '));
      setEditedAuthority('');
      setEditedJurisdiction('india');
      setEditedCategory('patent');
      setEditedLanguage('English');
      setEditedSourceUrl('');
      setSuggestion({
        jurisdiction: 'india',
        jurisdictionReason: 'Default fallback: Indian statutory regime',
        category: 'patent',
        categoryReason: 'Default fallback: Patent provisions',
        language: 'English',
        languageReason: 'English legal terminology',
        title: null,
        titleReason: 'title: null — could not automatically infer from text',
        authority: null,
        authorityReason: 'authority: null — not explicitly stated in text',
        source_url: null,
        sourceUrlReason: 'source_url: null — no URL found in text',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // When queue or currentIndex changes, analyze next file
  useEffect(() => {
    if (queue.length > 0 && currentIndex < queue.length) {
      analyzeCurrentFile(queue[currentIndex]);
    }
  }, [currentIndex, queue]);

  // Extract plain text from a PDF file using pdf.js
  const extractPdfText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      pageTexts.push(pageText);
    }
    return pageTexts.join('\n\n');
  };

  // Extract plain text from a modern Word (.docx) file using mammoth
  const extractDocxText = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  // Add files to queue
  const handleFilesAdded = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: QueuedFile[] = [];
    const skippedFiles: string[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const lowerName = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
      const isDocx =
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx');
      const isLegacyDoc = lowerName.endsWith('.doc') && !isDocx;

      if (isLegacyDoc) {
        // Legacy binary .doc (pre-2007 Word format) cannot be reliably parsed
        // client-side. Rather than silently ingesting garbled binary text,
        // skip it and tell the user to convert first.
        skippedFiles.push(`${file.name} (legacy .doc not supported — re-save as .docx or .pdf)`);
        continue;
      }

      try {
        let text: string;
        if (isPdf) {
          text = await extractPdfText(file);
        } else if (isDocx) {
          text = await extractDocxText(file);
        } else {
          text = await file.text();
        }

        if (text.trim()) {
          newFiles.push({
            name: file.name,
            size: file.size,
            rawText: text,
          });
        } else {
          skippedFiles.push(`${file.name} (no extractable text — may be a scanned/image-only file)`);
        }
      } catch (err) {
        skippedFiles.push(`${file.name} (failed to read)`);
        console.warn(`Could not read file ${file.name}`, err);
      }
    }

    if (skippedFiles.length > 0) {
      setIngestionMessage(`Skipped ${skippedFiles.length} file(s): ${skippedFiles.join('; ')}`);
    }

    if (newFiles.length > 0) {
      const updatedQueue = [...queue, ...newFiles];
      setQueue(updatedQueue);
      if (queue.length === 0) {
        setCurrentIndex(0);
      }
    }
  };

  // Compute how many tags were corrected compared to Gemini's suggestion
  const calculateCorrectionsCount = (): number => {
    if (!suggestion) return 0;
    let corrections = 0;
    if (editedJurisdiction !== suggestion.jurisdiction) corrections++;
    if (editedCategory !== suggestion.category) corrections++;
    if (editedLanguage.toLowerCase() !== suggestion.language.toLowerCase()) corrections++;
    if (editedTitle !== (suggestion.title || '')) corrections++;
    if (editedAuthority !== (suggestion.authority || '')) corrections++;
    if (editedSourceUrl !== (suggestion.source_url || '')) corrections++;
    return corrections;
  };

  // Confirm and Ingest current document
  const handleConfirmAndIngest = async () => {
    if (queue.length === 0 || currentIndex >= queue.length) return;

    const currentFile = queue[currentIndex];
    const correctionsCount = calculateCorrectionsCount();

    setIsIngesting(true);
    setIngestionMessage(null);

    try {
      const payload = {
        title: editedTitle.trim() || currentFile.name,
        authority: editedAuthority.trim() || null,
        jurisdiction: editedJurisdiction,
        category: editedCategory,
        language: editedLanguage.trim() || 'English',
        source_url: editedSourceUrl.trim() || null,
        rawText: currentFile.rawText,
        correctionsCount,
      };

      const res = await fetch('/api/admin/ingest-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        handleAuthFailure();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ingestion request failed.');
      }

      setIngestionMessage(`Successfully ingested "${payload.title}" (${data.chunksCount} chunks, vector(768)).`);
      await Promise.all([fetchStats(), fetchDocuments()]);

      // Advance to next document automatically after short pause
      setTimeout(() => {
        if (currentIndex + 1 < queue.length) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          // Completed all files
          setQueue([]);
          setCurrentIndex(0);
          setSuggestion(null);
        }
        setIsIngesting(false);
      }, 1000);
    } catch (err: any) {
      setIsIngesting(false);
      setIngestionMessage(`Ingestion failed: ${err.message}`);
    }
  };

  // Skip current document
  const handleSkip = () => {
    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setQueue([]);
      setCurrentIndex(0);
      setSuggestion(null);
    }
  };

  // Purge all documents and chunks from the database
  const handlePurgeAllDocuments = async () => {
    if (
      !window.confirm(
        'Are you sure you want to purge all documents and vector chunks from the database? This action will completely clear the corpus so only your newly uploaded authentic documents exist.'
      )
    ) {
      return;
    }
    try {
      setIsLoadingDocs(true);
      const res = await fetch('/api/admin/documents/purge-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (res.status === 401) {
        handleAuthFailure();
        return;
      }

      const data = await res.json();
      if (data.success) {
        setStatusFeedback({
          type: 'success',
          message: data.message || 'All documents successfully purged from database.',
        });
        await Promise.all([fetchStats(), fetchDocuments()]);
      } else {
        setStatusFeedback({
          type: 'error',
          message: data.error || 'Failed to purge documents.',
        });
      }
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        message: 'Network error while purging documents: ' + err.message,
      });
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // If NOT authenticated, show the multi-step passcode and security challenge lock screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-teal-950 border border-teal-700/60 text-emerald-400 mb-2 shadow-inner">
              <KeyRound className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-wide font-display">
              Administrative Corpus Ingestion
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Session-bound authentication with multi-step statutory verification to access corpus ingestion & vector management.
            </p>
          </div>

          {/* Multi-step progress indicator */}
          <div className="flex items-center justify-center gap-2 pt-1 pb-1">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                authStep === 1
                  ? 'bg-teal-950 border-teal-500 text-teal-300'
                  : 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
              }`}
            >
              {authStep > 1 ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-teal-800 text-[10px] flex items-center justify-center">
                  1
                </span>
              )}
              <span>Passcode</span>
            </div>
            <div className="w-6 h-0.5 bg-slate-700" />
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                authStep === 2
                  ? 'bg-teal-950 border-teal-500 text-teal-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] flex items-center justify-center">
                2
              </span>
              <span>Verification</span>
            </div>
          </div>

          {authStep === 1 ? (
            /* STEP 1: Passcode Form */
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Step 1: Master Administrative Passcode
                </label>
                <div className="relative">
                  <input
                    id="admin-passcode-input"
                    type={showPassword ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter administrative passcode..."
                    autoFocus
                    className="w-full px-4 py-2.5 pr-11 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                    title={showPassword ? 'Hide passcode' : 'Show passcode'}
                    aria-label={showPassword ? 'Hide passcode' : 'Show passcode'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Default deployment passcode: <code className="text-teal-300 font-mono">ipsakti2026</code>
                </p>
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                id="admin-step1-submit"
                type="submit"
                disabled={isVerifying || !passcode.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Passcode...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Proceed to Step 2 Verification</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: Security Verification & Statutory Authority Declaration */
            <form onSubmit={handleStep2Submit} className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Step 1 Passcode verified. Challenge token issued.</span>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Step 2: Department Security PIN / Authorization Key
                </label>
                <input
                  id="admin-security-pin-input"
                  type="password"
                  value={securityPin}
                  onChange={(e) => setSecurityPin(e.target.value)}
                  placeholder="Enter administrative security PIN"
                  autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 font-mono"
                />
              </div>

              {/* Statutory Compliance Declaration */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 text-xs space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    id="admin-declaration-checkbox"
                    type="checkbox"
                    checked={authorityDeclaration}
                    onChange={(e) => setAuthorityDeclaration(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-teal-600 bg-slate-900 border-slate-700 focus:ring-teal-500 cursor-pointer"
                  />
                  <span className="text-slate-300 leading-snug">
                    I declare administrative authority to manage the IP-SAKTI knowledge base under the Drugs & Cosmetics Act, Indian Patents Act, and Biological Diversity Act frameworks.
                  </span>
                </label>
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAuthStep(1);
                    setAuthError(null);
                  }}
                  className="w-1/3 py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  id="admin-step2-submit"
                  type="submit"
                  disabled={isVerifying || !authorityDeclaration}
                  className="w-2/3 py-2.5 px-4 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Authorize Session</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
            <button
              onClick={onNavigateHome}
              className="flex items-center gap-1.5 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Public Console
            </button>
            <span className="font-mono text-[10px] text-teal-400/80 bg-teal-950/50 border border-teal-800/40 px-2 py-0.5 rounded">
              SESSION-BOUND
            </span>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = queue.length > 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Admin Navigation Bar */}
      <header className="bg-[#0B3B32] text-white border-b border-teal-900 px-6 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-teal-950 border border-teal-700/60 text-emerald-300">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white font-display">
                  IP-SAKTI Corpus Administration
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  vector(768)
                </span>
              </div>
              <p className="text-xs text-teal-200">
                Statutory Ingestion, Metadata Disambiguation & Embedding Pipeline
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/70 border border-emerald-600/50 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Session-Bound Admin
            </span>
            <button
              id="admin-exit-to-app-btn"
              onClick={onNavigateHome}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-900 hover:bg-teal-800 text-teal-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-teal-700 shadow-xs"
              title="Return to public assistant (keeps your admin session active)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit to Public App</span>
            </button>
            <button
              id="admin-logout-btn"
              onClick={handleLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-rose-800/60 shadow-xs"
              title="End administrative session and lock portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-6 space-y-6 flex-1">
        {/* Running Summary Dashboard */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-800">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                {documents.length || stats.totalDocuments}
              </div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="text-emerald-700 font-semibold">
                  {documents.filter((d) => d.status === 'active').length} active
                </span>
                <span>·</span>
                <span className="text-slate-500">
                  {documents.filter((d) => d.status === 'deactivated').length} deactivated
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{stats.totalChunks}</div>
              <div className="text-xs text-slate-500 font-medium">Chunks Indexed (150-400w)</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{stats.tagsCorrected}</div>
              <div className="text-xs text-slate-500 font-medium">Suggested Tags Corrected</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-800">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">768-D</div>
              <div className="text-xs text-slate-500 font-medium">Gemini Embedding Standard</div>
            </div>
          </div>
        </section>

        {/* Upload & Ingestion Workspace */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Section Header */}
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-teal-800" />
                Document Intake & Bulk Pipeline
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload single or bulk files (or whole folders). Each file will prompt a model suggestion, human review, and vectorization.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept=".txt,.md,.json,.csv,.doc,.docx,.pdf"
                className="hidden"
                onChange={(e) => handleFilesAdded(e.target.files)}
              />
              <input
                type="file"
                ref={folderInputRef}
                // @ts-ignore
                webkitdirectory="true"
                directory="true"
                multiple
                className="hidden"
                onChange={(e) => handleFilesAdded(e.target.files)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-teal-800" />
                <span>Select Files</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <FolderUp className="w-3.5 h-3.5 text-teal-800" />
                <span>Upload Folder</span>
              </button>
            </div>
          </div>

          {/* If No Files in Queue */}
          {queue.length === 0 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesAdded(e.dataTransfer.files);
              }}
              className="p-12 text-center border-2 border-dashed border-slate-200 m-6 rounded-xl hover:border-teal-700/50 transition-colors bg-slate-50/50 flex flex-col items-center justify-center space-y-3"
            >
              <div className="p-3 rounded-full bg-teal-100/60 text-teal-800">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Drag and drop files here, or click "Select Files"
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Supports Indian Patent Acts, TKDL monographs, ABS notifications, or foreign patent conventions.
                  Click <strong>"Select Files"</strong> or <strong>"Upload Folder"</strong> to begin.
                </p>
              </div>
            </div>
          ) : (
            /* Active Review Step-by-Step Flow */
            <div className="p-6 space-y-6">
              {/* Queue Progress Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50/60 border border-teal-200 text-xs text-teal-950">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-teal-900">
                    Document {currentIndex + 1} of {queue.length}:
                  </span>
                  <span className="font-mono font-medium">{currentFile?.name}</span>
                  <span className="text-teal-700">({Math.round((currentFile?.size || 0) / 1024)} KB)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-teal-700">
                    {queue.length - currentIndex - 1} remaining in queue
                  </span>
                </div>
              </div>

              {/* Status or Analysis State */}
              {isAnalyzing && (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center space-x-3">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-700" />
                  <span>
                    <strong>suggestMetadata</strong> is reading document text and calling Gemini to propose jurisdiction, category, and extraction reasons...
                  </span>
                </div>
              )}

              {ingestionMessage && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>{ingestionMessage}</span>
                </div>
              )}

              {/* Two Column Layout: Form / Suggestions & Text Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Form Controls & AI Reasons */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-teal-800" />
                        Human Verification & Metadata Confirmation
                      </span>
                      {calculateCorrectionsCount() > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          {calculateCorrectionsCount()} field(s) edited
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-800">
                        Document Title *
                      </label>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                      />
                      {suggestion?.titleReason && (
                        <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                          💡 <strong>Justification:</strong> {suggestion.titleReason}
                        </p>
                      )}
                    </div>

                    {/* Authority */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-800">
                        Regulatory Authority / Issuing Body
                      </label>
                      <input
                        type="text"
                        value={editedAuthority}
                        onChange={(e) => setEditedAuthority(e.target.value)}
                        placeholder="Leave blank if not stated in text"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                      />
                      {suggestion?.authorityReason && (
                        <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                          💡 <strong>Justification:</strong> {suggestion.authorityReason}
                        </p>
                      )}
                    </div>

                    {/* Jurisdiction & Category Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Jurisdiction */}
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-800">
                          Jurisdiction *
                        </label>
                        <select
                          value={editedJurisdiction}
                          onChange={(e) =>
                            setEditedJurisdiction(e.target.value as 'india' | 'international')
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                        >
                          <option value="india">india (Indian Patents / AYUSH / NBA)</option>
                          <option value="international">international (PCT / USPTO / EPO / WIPO)</option>
                        </select>
                        {suggestion?.jurisdictionReason && (
                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                            💡 {suggestion.jurisdictionReason}
                          </p>
                        )}
                      </div>

                      {/* Category */}
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-800">
                          Category *
                        </label>
                        <select
                          value={editedCategory}
                          onChange={(e) =>
                            setEditedCategory(
                              e.target.value as 'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL'
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                        >
                          <option value="patent">patent</option>
                          <option value="trademark">trademark</option>
                          <option value="GI">GI (Geographical Indications)</option>
                          <option value="ABS">ABS (Access & Benefit Sharing / NBA)</option>
                          <option value="regulatory">regulatory (Drug Licensing / Rule 158B)</option>
                          <option value="TKDL">TKDL (Traditional Knowledge Digital Library)</option>
                        </select>
                        {suggestion?.categoryReason && (
                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                            💡 {suggestion.categoryReason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Language & Source URL */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-800">
                          Primary Language *
                        </label>
                        <input
                          type="text"
                          value={editedLanguage}
                          onChange={(e) => setEditedLanguage(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                        />
                        {suggestion?.languageReason && (
                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                            💡 {suggestion.languageReason}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-800">
                          Source URL
                        </label>
                        <input
                          type="text"
                          value={editedSourceUrl}
                          onChange={(e) => setEditedSourceUrl(e.target.value)}
                          placeholder="null if absent"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-teal-700 focus:border-teal-700 outline-none"
                        />
                        {suggestion?.sourceUrlReason && (
                          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                            💡 {suggestion.sourceUrlReason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleSkip}
                        disabled={isIngesting}
                        className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
                      >
                        Skip This File
                      </button>

                      <button
                        id="confirm-and-ingest-button"
                        type="button"
                        disabled={isIngesting || isAnalyzing}
                        onClick={handleConfirmAndIngest}
                        className="px-5 py-2.5 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isIngesting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Vectorizing Chunks & Inserting into Supabase...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Confirm & Ingest Document</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Raw Text & Chunk Partition Preview */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-800" />
                        Document Text Preview
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {currentFile?.rawText.split(/\s+/).length || 0} words
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono text-slate-700 max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {currentFile?.rawText}
                    </div>

                    <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 text-[11px] text-teal-900 leading-relaxed">
                      <strong>Chunking Rule:</strong> Partitioned at natural legal clauses into chunks of roughly 150-400 words. Each chunk is embedded with <strong>gemini-embedding-2</strong> (falling back to <strong>gemini-embedding-001</strong> if unavailable) at <strong>output_dimensionality=768</strong>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* All Rows in "documents" Table with Deactivate / Reactivate Toggle */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-900 text-teal-200">
                  <Database className="w-4 h-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
                  Knowledge Base Documents ({documents.length})
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {documents.filter((d) => d.status === 'active').length} Active
                </span>
                {documents.filter((d) => d.status === 'deactivated').length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                    {documents.filter((d) => d.status === 'deactivated').length} Deactivated
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                All records stored in the &quot;documents&quot; table. Toggling status performs a soft delete or reactivation—chunks and embeddings are never hard-deleted.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-refresh-documents"
                type="button"
                onClick={() => {
                  fetchStats();
                  fetchDocuments();
                }}
                disabled={isLoadingDocs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Refresh documents table"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                id="btn-purge-all-documents"
                type="button"
                onClick={handlePurgeAllDocuments}
                disabled={isLoadingDocs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 hover:text-rose-800 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                title="Purge all documents from database"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Purge Corpus</span>
              </button>
            </div>
          </div>

          {/* Soft-Delete Policy Notice */}
          <div className="px-5 py-2.5 bg-teal-50/50 border-b border-teal-100 text-[11.5px] text-teal-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-teal-950">Soft-Delete & RAG Protection:</span> Deactivating a document updates the database <code className="px-1 py-0.5 bg-teal-100/70 rounded text-[10.5px] font-mono">status</code> column to <code className="px-1 py-0.5 bg-teal-100/70 rounded text-[10.5px] font-mono">&apos;deactivated&apos;</code>. The document is instantly omitted from public AI queries, while preserving all textual chunks, section labels, and 768-dimensional vectors intact for instant reactivation.
            </div>
          </div>

          {/* Interactive Status Feedback Toast */}
          {statusFeedback && (
            <div
              className={`mx-5 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                statusFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{statusFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusFeedback(null)}
                className="text-[11px] font-semibold underline hover:opacity-75 cursor-pointer ml-4"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Search and Filters Bar */}
          <div className="p-4 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="search-documents-input"
                type="text"
                placeholder="Search by title, authority, category, or language..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 text-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills & Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Segmented Control */}
              <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({documents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-white text-emerald-800 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active ({documents.filter((d) => d.status === 'active').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('deactivated')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    statusFilter === 'deactivated'
                      ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Deactivated ({documents.filter((d) => d.status === 'deactivated').length})
                </button>
              </div>

              {/* Category Filter */}
              <select
                id="filter-category-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                <option value="all">All Categories</option>
                <option value="patent">Patent</option>
                <option value="regulatory">Regulatory</option>
                <option value="ABS">ABS (Biodiversity)</option>
                <option value="TKDL">TKDL</option>
                <option value="trademark">Trademark</option>
                <option value="GI">Geographical Indication</option>
              </select>

              {/* Jurisdiction Filter */}
              <select
                id="filter-jurisdiction-select"
                value={jurisdictionFilter}
                onChange={(e) => setJurisdictionFilter(e.target.value as any)}
                className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-700"
              >
                <option value="all">All Jurisdictions</option>
                <option value="india">India</option>
                <option value="international">International</option>
              </select>

              {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' || jurisdictionFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                    setJurisdictionFilter('all');
                  }}
                  className="text-xs text-teal-800 hover:text-teal-950 font-medium px-2 py-1 rounded hover:bg-teal-50 cursor-pointer transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {isLoadingDocs && documents.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 text-teal-800 animate-spin" />
                <span>Loading documents from database...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-3">
                <div className="p-4 rounded-2xl bg-teal-50 border border-teal-100 text-teal-850">
                  <Database className="w-8 h-8 text-teal-700" />
                </div>
                <div className="max-w-md space-y-1">
                  <p className="text-sm font-bold text-slate-900">Knowledge Base is Empty & Ready</p>
                  <p className="text-slate-500 leading-relaxed text-xs">
                    Only authentic, administrator-verified statutory Acts, notifications, and gazettes uploaded above will be indexed into the knowledge base.
                  </p>
                </div>
              </div>
            ) : (
              (() => {
                const filtered = documents.filter((doc) => {
                  if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
                  if (categoryFilter !== 'all' && doc.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
                  if (jurisdictionFilter !== 'all' && doc.jurisdiction?.toLowerCase() !== jurisdictionFilter.toLowerCase()) return false;
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase();
                    const titleMatch = doc.title?.toLowerCase().includes(q);
                    const authMatch = doc.authority?.toLowerCase().includes(q);
                    const catMatch = doc.category?.toLowerCase().includes(q);
                    const langMatch = doc.language?.toLowerCase().includes(q);
                    const jurMatch = doc.jurisdiction?.toLowerCase().includes(q);
                    return titleMatch || authMatch || catMatch || langMatch || jurMatch;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-10 text-center text-xs text-slate-500 space-y-2">
                      <p>No documents match your current filter or search criteria.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('all');
                          setCategoryFilter('all');
                          setJurisdictionFilter('all');
                        }}
                        className="text-teal-800 font-semibold underline hover:text-teal-950 cursor-pointer"
                      >
                        Clear filters
                      </button>
                    </div>
                  );
                }

                return (
                  <table id="documents-table" className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Title
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Category
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Jurisdiction
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Language
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Status
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900">
                          Upload Date
                        </th>
                        <th scope="col" className="py-3.5 px-4 font-semibold text-slate-900 text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filtered.map((doc) => {
                        const isDeactivated = doc.status === 'deactivated';
                        const isToggling = togglingId === doc.id;

                        // Category styling badge
                        let categoryBadgeClass = 'bg-slate-100 text-slate-800 border-slate-200';
                        switch (doc.category?.toLowerCase()) {
                          case 'patent':
                            categoryBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
                            break;
                          case 'regulatory':
                            categoryBadgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
                            break;
                          case 'abs':
                            categoryBadgeClass = 'bg-amber-50 text-amber-900 border-amber-200';
                            break;
                          case 'tkdl':
                            categoryBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                            break;
                          case 'trademark':
                            categoryBadgeClass = 'bg-cyan-50 text-cyan-800 border-cyan-200';
                            break;
                          case 'gi':
                            categoryBadgeClass = 'bg-teal-50 text-teal-800 border-teal-200';
                            break;
                        }

                        // Upload date formatting
                        let formattedDate = '—';
                        if (doc.upload_date) {
                          try {
                            const d = new Date(doc.upload_date);
                            if (!isNaN(d.getTime())) {
                              formattedDate = d.toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                            } else {
                              formattedDate = doc.upload_date;
                            }
                          } catch {
                            formattedDate = doc.upload_date;
                          }
                        }

                        return (
                          <tr
                            key={doc.id}
                            className={`transition-colors ${
                              isDeactivated ? 'bg-slate-50/50 hover:bg-slate-100/60' : 'hover:bg-slate-50/90'
                            }`}
                          >
                            {/* Title Column */}
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-0.5">
                                <div
                                  className={`font-semibold leading-snug ${
                                    isDeactivated ? 'text-slate-600 line-through decoration-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  {doc.title}
                                </div>
                                {doc.authority && (
                                  <div className="text-[11px] text-slate-500">
                                    {doc.authority}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                  {doc.chunk_count && (
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {doc.chunk_count} {doc.chunk_count === 1 ? 'chunk' : 'chunks'}
                                    </span>
                                  )}
                                  {doc.source_url && (
                                    <a
                                      href={doc.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10.5px] text-teal-700 hover:text-teal-900 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>Source</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Category Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${categoryBadgeClass}`}
                              >
                                {doc.category || 'general'}
                              </span>
                            </td>

                            {/* Jurisdiction Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  doc.jurisdiction === 'india'
                                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {doc.jurisdiction}
                              </span>
                            </td>

                            {/* Language Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-slate-700">
                              {doc.language || 'English'}
                            </td>

                            {/* Status Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {doc.status === 'active' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  Deactivated
                                </span>
                              )}
                            </td>

                            {/* Upload Date Column */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-slate-600">
                              {formattedDate}
                            </td>

                            {/* Action Column: Deactivate / Reactivate Toggle */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-right">
                              <button
                                id={`toggle-status-${doc.id}`}
                                type="button"
                                disabled={isToggling}
                                onClick={() => handleToggleStatus(doc)}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-50 ${
                                  doc.status === 'active'
                                    ? 'bg-white border border-amber-300 hover:bg-amber-50 hover:border-amber-400 text-amber-900'
                                    : 'bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-800'
                                }`}
                                title={
                                  doc.status === 'active'
                                    ? 'Deactivate document (soft delete: status becomes deactivated, chunks preserved)'
                                    : 'Reactivate document for public RAG queries'
                                }
                              >
                                {isToggling ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Updating...</span>
                                  </>
                                ) : doc.status === 'active' ? (
                                  <>
                                    <PowerOff className="w-3.5 h-3.5 text-amber-700" />
                                    <span>Deactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                                    <span>Reactivate</span>
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()
            )}
          </div>

          {/* Table Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 gap-2">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-700">
                {
                  documents.filter((doc) => {
                    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
                    if (categoryFilter !== 'all' && doc.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
                    if (jurisdictionFilter !== 'all' && doc.jurisdiction?.toLowerCase() !== jurisdictionFilter.toLowerCase()) return false;
                    if (searchQuery.trim()) {
                      const q = searchQuery.toLowerCase();
                      return (
                        doc.title?.toLowerCase().includes(q) ||
                        doc.authority?.toLowerCase().includes(q) ||
                        doc.category?.toLowerCase().includes(q) ||
                        doc.language?.toLowerCase().includes(q) ||
                        doc.jurisdiction?.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  }).length
                }
              </span>{' '}
              of <span className="font-semibold text-slate-700">{documents.length}</span> total rows in documents table
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Database schema: documents (UUID PK, text status)
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
