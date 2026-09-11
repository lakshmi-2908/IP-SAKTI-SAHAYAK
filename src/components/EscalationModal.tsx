import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  X,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  HelpCircle,
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  Languages,
} from 'lucide-react';
import { ProductClassificationSummary } from '../types';

interface EscalationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  questionSummary?: string;
  classification?: ProductClassificationSummary | null;
  language?: 'English' | 'Hindi';
}

/**
 * Builds the initial pre-filled question summary combining the recent query
 * and stored product classification metadata if available.
 */
export function buildQuestionSummary(
  question: string,
  classification?: ProductClassificationSummary | null
): string {
  const baseQuestion = (question || '').trim();

  if (!classification || !classification.isClassified) {
    return baseQuestion || 'Inquiry regarding traditional formulation statutory patentability & compliance';
  }

  const details: string[] = [];
  const prodName = classification.productName || classification.rawInputs?.productNameOrDescription;
  if (prodName) {
    details.push(`Product: ${prodName}`);
  }

  const cat = classification.categoryName || classification.ayurvedicCategory;
  if (cat) {
    details.push(`Classification: ${cat}`);
  }

  const pathway = classification.regulatoryPathway || classification.regulatoryRegime;
  if (pathway) {
    details.push(`Regulatory Pathway: ${pathway}`);
  }

  if (details.length === 0) {
    return baseQuestion;
  }

  const contextBlock = `[Formulation Context: ${details.join(' | ')}]`;
  if (!baseQuestion) {
    return contextBlock;
  }

  return `${baseQuestion}\n\n${contextBlock}`;
}

export const EscalationModal: React.FC<EscalationModalProps> = ({
  isOpen,
  onClose,
  conversationId = '',
  questionSummary = '',
  classification = null,
  language = 'English',
}) => {
  const [name, setName] = useState<string>('');
  const [contact, setContact] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<'English' | 'Hindi'>('English');
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [escalationId, setEscalationId] = useState<string | null>(null);

  // Synchronize initial pre-filled values whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setPreferredLanguage(language === 'Hindi' ? 'Hindi' : 'English');
      setSummaryText(buildQuestionSummary(questionSummary, classification));
      setErrorMessage(null);
      // Keep previous name/contact if user re-opens in same session unless already submitted
      if (submitSuccess) {
        setSubmitSuccess(false);
        setEscalationId(null);
      }
    }
  }, [isOpen, questionSummary, classification, language]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  // Simple format check for contact: looks like an email or looks like a phone number
  const trimmedContact = contact.trim();
  const hasContact = trimmedContact.length > 0;
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact);
  const digitsOnly = trimmedContact.replace(/\D/g, '');
  const looksLikePhone =
    digitsOnly.length >= 7 &&
    digitsOnly.length <= 16 &&
    /^[\d\s+\-().]{7,25}$/.test(trimmedContact);

  // Inline warning when text is provided but doesn't match standard email or phone format
  // NOTE: Per specification, this warning NEVER hard-blocks submission!
  const showContactWarning = hasContact && !looksLikeEmail && !looksLikePhone;

  const handleClose = () => {
    onClose();
    if (submitSuccess) {
      setSubmitSuccess(false);
      setEscalationId(null);
      setName('');
      setContact('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!trimmedContact) {
      setErrorMessage(
        language === 'Hindi'
          ? 'कृपया संपर्क हेतु ईमेल या फ़ोन नंबर दर्ज करें।'
          : 'Please provide an email or phone number so an AYUSH IP facilitator can contact you.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/escalations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId || crypto.randomUUID(),
          name: name.trim() || 'Anonymous Practitioner / Applicant',
          contact: trimmedContact,
          preferred_language: preferredLanguage,
          question_summary: summaryText.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to record escalation request');
      }

      setEscalationId(data.escalation_id || null);
      setSubmitSuccess(true);
    } catch (err: any) {
      console.error('[EscalationModal] Submission failed:', err);
      setErrorMessage(
        err.message || 'Unable to submit escalation request. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isHindi = language === 'Hindi';

  return (
    <div
      id="escalation-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="escalation-modal-title"
    >
      <div
        id="escalation-modal-dialog"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-4 sm:my-6 transition-all"
      >
        {/* Header */}
        <div className="bg-[#0B3B32] text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-teal-900">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-teal-800/60 text-teal-200">
              <UserCheck className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 id="escalation-modal-title" className="text-base font-bold tracking-tight font-display">
                {isHindi ? 'आयुष आईपी सुविधाकर्ता से परामर्श' : 'AYUSH Legal Facilitator Consultation'}
              </h2>
              <p className="text-xs text-teal-200/80">
                {isHindi
                  ? 'प्रमाणित पेटेंट एवं विनियामक सुविधा डेस्क'
                  : 'Certified Ayush Patent Attorney & Regulatory Desk'}
              </p>
            </div>
          </div>
          <button
            id="close-escalation-modal"
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-teal-200 hover:text-white hover:bg-teal-800/60 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6">
          {submitSuccess ? (
            /* Confirmation Screen */
            <div id="escalation-confirmation-box" className="space-y-5 animate-fade-in py-2">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3.5">
                <div className="p-2 bg-emerald-100 rounded-full text-emerald-700 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-950">
                    {isHindi ? 'अनुरोध सफलतापूर्वक दर्ज किया गया' : 'Escalation Ticket Registered'}
                  </h3>
                  <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                    Your question has been shared with an AYUSH IP facilitation contact; they will follow up using the details you provided.
                  </p>
                  {isHindi && (
                    <p className="text-[11px] text-emerald-800 leading-relaxed pt-1">
                      आपका प्रश्न आयुष आईपी सुविधा संपर्क के साथ साझा कर दिया गया है; वे आपके द्वारा दिए गए विवरण का उपयोग करके संपर्क करेंगे।
                    </p>
                  )}
                </div>
              </div>

              {/* Handoff Details Summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200 flex items-center justify-between">
                  <span>Handoff Record</span>
                  {escalationId && (
                    <span className="font-mono text-[10px] text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      ID: {escalationId.slice(0, 8)}...
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Applicant / Name:</span>
                    <span className="font-semibold text-slate-800">{name || 'Anonymous Practitioner'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Contact Detail:</span>
                    <span className="font-semibold text-slate-800 break-all">{trimmedContact}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Preferred Language:</span>
                    <span className="font-medium text-slate-800">{preferredLanguage}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">Status:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-teal-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse"></span>
                      Open (Pending Review)
                    </span>
                  </div>
                </div>
              </div>

              {/* Advisory note */}
              <div className="flex items-center gap-2 p-3 bg-teal-50/70 rounded-lg border border-teal-200/80 text-teal-950 text-xs">
                <ShieldCheck className="w-4 h-4 text-teal-800 shrink-0" />
                <span>
                  No login required. Facilitation is offered under the Ministry of Ayush & DPIIT IP support framework.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end">
                <button
                  id="dismiss-escalation-modal-button"
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Done / Close
                </button>
              </div>
            </div>
          ) : (
            /* Active Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-0.5">
                  <Building2 className="w-3.5 h-3.5 text-teal-800" />
                  <span>AYUSH IPR Facilitation Scheme</span>
                </div>
                Connect directly with certified Ayush patent attorneys and technical examiners for complex novelty, Rule 158B licensing, or Section 3(p) queries.
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Field 1: Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="escalation-name-input"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  {isHindi ? 'आपका नाम (Full Name)' : 'Full Name'}
                </label>
                <input
                  id="escalation-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma / Vaidya A. Patel"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 transition-colors"
                />
              </div>

              {/* Field 2: Contact (Email or Phone) with format check & non-blocking warning */}
              <div className="space-y-1.5">
                <label
                  htmlFor="escalation-contact-input"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  {isHindi ? 'संपर्क: ईमेल या फ़ोन (Contact Details)' : 'Contact (Email or Phone)'}
                  <span className="text-teal-700 ml-1">*</span>
                </label>
                <div className="relative">
                  <input
                    id="escalation-contact-input"
                    type="text"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="e.g. advocate@ayushfirm.in or +91 98765 43210"
                    className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-xs text-slate-900 placeholder:text-slate-400 transition-colors ${
                      showContactWarning
                        ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500'
                        : 'border-slate-300 focus:border-teal-600 focus:ring-teal-600'
                    }`}
                  />
                </div>

                {/* Inline warning if neither email nor phone format matches — NOT hard blocking */}
                {showContactWarning && (
                  <div
                    id="escalation-contact-warning"
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs mt-1 animate-fade-in"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="leading-snug text-[11px]">
                      <span className="font-semibold">Unusual contact format: </span>
                      This does not look like a standard email address or phone number. You can still submit, but please make sure it is reachable so our facilitator can follow up.
                    </div>
                  </div>
                )}
                <p className="text-[10.5px] text-slate-500">
                  We will use this to follow up with verified legal counsel notes. No account or login required.
                </p>
              </div>

              {/* Field 3: Preferred Language */}
              <div className="space-y-1.5">
                <label
                  htmlFor="escalation-language-select"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Languages className="w-3.5 h-3.5 text-teal-800" />
                  <span>{isHindi ? 'पसंदीदा परामर्श भाषा (Preferred Language)' : 'Preferred Language'}</span>
                </label>
                <select
                  id="escalation-language-select"
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as 'English' | 'Hindi')}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 rounded-lg text-xs text-slate-900 transition-colors cursor-pointer"
                >
                  <option value="English">English (Statutory standard)</option>
                  <option value="Hindi">हिंदी - Hindi (राजभाषा एवं परामर्श)</option>
                </select>
              </div>

              {/* Field 4: Pre-filled Question Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="escalation-summary-textarea"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-teal-800" />
                    <span>
                      {isHindi
                        ? 'प्रश्न एवं उत्पाद वर्गीकरण सारांश'
                        : 'Question & Formulation Summary'}
                    </span>
                  </label>
                  <span className="text-[10.5px] text-teal-700 font-medium">Pre-filled & editable</span>
                </div>
                <textarea
                  id="escalation-summary-textarea"
                  rows={4}
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Summarize your query and traditional formulation context..."
                  className="w-full px-3.5 py-2.5 bg-slate-50/60 focus:bg-white border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 font-sans transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* Form Footer Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  id="submit-escalation-button"
                  type="submit"
                  disabled={isSubmitting || !trimmedContact}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#0B3B32] hover:bg-[#082a24] text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'सुविधाकर्ता को भेजें' : 'Submit to Facilitator'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
