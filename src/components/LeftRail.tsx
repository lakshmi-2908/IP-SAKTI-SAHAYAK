import React from 'react';
import {
  RotateCcw,
  BookOpenCheck,
  FileBadge,
  Sparkles,
  Leaf,
  Layers,
  X,
  ShieldCheck,
  Building2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Jurisdiction, Language } from '../types';

interface LeftRailProps {
  onResetConversation: () => void;
  onSelectPrompt: (promptText: string) => void;
  onOpenClassifyProduct?: () => void;
  onOpenAdmin?: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  jurisdiction: Jurisdiction;
  language: Language;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  onResetConversation,
  onSelectPrompt,
  onOpenClassifyProduct,
  onOpenAdmin,
  isOpenMobile,
  onCloseMobile,
  jurisdiction,
  language,
}) => {
  // Check if admin session is actively authenticated in sessionStorage (strictly session-bound)
  const isStoredAdmin = (() => {
    try {
      return (
        sessionStorage.getItem('ipsakti_admin_authenticated') === 'true' &&
        (!!sessionStorage.getItem('ipsakti_admin_session_token') ||
          !!sessionStorage.getItem('ipsakti_admin_passcode'))
      );
    } catch {
      return false;
    }
  })();

  const quickPrompts = [
    {
      id: 'quick-prompt-patent',
      title: language === 'Hindi' ? 'क्या मैं अपने फॉर्मूलेशन का पेटेंट करा सकता हूँ?' : 'Can I patent my formulation?',
      subtitle: jurisdiction === 'India' ? 'Patents Act 1970, Section 3(p) & TKDL' : 'WIPO, Novelty & Traditional Knowledge',
      icon: BookOpenCheck,
      promptText: 'Can I patent my formulation?',
    },
    {
      id: 'quick-prompt-standards',
      title: language === 'Hindi' ? 'आयुर्वेदिक फार्माकोपिया मानक' : 'Pharmacopoeia & Monograph Standards',
      subtitle: jurisdiction === 'India' ? 'API Vol II Monographs, Asava & Arishta Criteria' : 'Botanical Quality Monograph Standards',
      icon: FileBadge,
      promptText: 'What are the pharmacopoeial standards and monograph requirements for formulations in the Ayurvedic Pharmacopoeia of India (API)?',
    },
    {
      id: 'quick-prompt-raw-material',
      title: language === 'Hindi' ? 'क्या मेरी कच्ची सामग्री विनियमित है?' : 'Is my raw material regulated?',
      subtitle: jurisdiction === 'India' ? 'Schedule E(1), Biological Diversity Act' : 'CITES, Pharmacopeial & Heavy Metal limits',
      icon: Leaf,
      promptText: 'Is my raw material regulated?',
    },
    {
      id: 'quick-prompt-classify-product',
      title: language === 'Hindi' ? 'मेरे उत्पाद को वर्गीकृत करें' : 'Classify my product',
      subtitle: 'Ayurvedic Drug vs Food / Dietary Supplement',
      icon: Layers,
      promptText: 'Classify my product',
      isPrompt8Target: true, // Marked for future wiring in Prompt 8
    },
  ];

  const content = (
    <div className="flex flex-col h-full bg-[#FAFCFB] border-r border-slate-200 w-72 sm:w-80 shrink-0 select-none">
      {/* Rail Header with Reset Action */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between lg:hidden mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 font-display">
            Guidance Navigator
          </span>
          <button
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation Reset Button */}
        <button
          id="reset-conversation-button"
          onClick={onResetConversation}
          className="w-full flex items-center justify-center space-x-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold shadow-2xs transition-all active:scale-[0.99] cursor-pointer"
          title="Clear current session and start a new guidance consultation"
        >
          <RotateCcw className="w-3.5 h-3.5 text-teal-800" />
          <span>{language === 'Hindi' ? 'संवाद रीसेट करें' : 'Reset Conversation'}</span>
        </button>
      </div>

      {/* Quick-Start Prompts Section */}
      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>Quick-Start Guidance</span>
          </h2>
          <span className="text-[10px] text-slate-400 font-mono">4 Prompts</span>
        </div>

        <p className="text-[11px] text-slate-500 leading-normal">
          {language === 'Hindi'
            ? 'त्वरित विनियामक और बौद्धिक संपदा अन्वेषण के लिए मानक प्रश्नों का चयन करें:'
            : 'Select a standardized regulatory query to initiate compliance triage:'}
        </p>

        <div className="space-y-2.5 pt-1">
          {quickPrompts.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={item.id}
                onClick={() => {
                  if (item.isPrompt8Target && onOpenClassifyProduct) {
                    onOpenClassifyProduct();
                  } else {
                    onSelectPrompt(item.promptText);
                  }
                }}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-150 relative group cursor-pointer ${
                  item.isPrompt8Target
                    ? 'bg-emerald-50/70 hover:bg-emerald-50 border-emerald-300/80 hover:border-emerald-400 text-teal-950'
                    : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-teal-600/40 text-slate-800 shadow-2xs'
                }`}
                title={`Click to inquire: "${item.title}"`}
              >
                <div className="flex items-start space-x-2.5">
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      item.isPrompt8Target
                        ? 'bg-teal-800 text-emerald-200'
                        : 'bg-slate-100 group-hover:bg-teal-50 text-teal-800 transition-colors'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 group-hover:text-[#0B3B32] transition-colors leading-snug">
                        {item.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      {item.subtitle}
                    </p>
                    {item.isPrompt8Target && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-teal-800/10 text-teal-900 border border-teal-800/20">
                        <span>Classification Workflow Anchor</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Regulatory Authorities Reference Box */}
        <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-600 space-y-2">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-slate-500" />
            <span>Active Regime Benchmarks</span>
          </div>

          <div className="p-2.5 bg-slate-100/80 rounded-lg border border-slate-200/80 text-[11px] space-y-1.5 text-slate-600">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Regime:</span>
              <span className="font-semibold text-teal-900">
                {jurisdiction === 'India' ? 'Indian (AYUSH/IPO)' : 'International (WIPO/FDA)'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Language:</span>
              <span className="font-semibold text-teal-900">{language}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
              <span>TKDL Cross-Check:</span>
              <span className="text-emerald-700 font-medium">Active Schema</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Portal Quick Access */}
      {onOpenAdmin && (
        <div className="p-2.5 bg-emerald-950/5 border-t border-slate-200">
          <button
            id="left-rail-admin-btn"
            onClick={onOpenAdmin}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-teal-900 text-white hover:bg-teal-800 transition-colors text-xs font-medium cursor-pointer shadow-xs"
            title={
              isStoredAdmin
                ? 'Open Administrative Ingestion Portal (Session Active — Alt+A)'
                : 'Open Administrative Ingestion Portal (Alt+A)'
            }
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                {isStoredAdmin && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <span>{isStoredAdmin ? 'Admin Portal (Signed In)' : 'Admin Ingestion Portal'}</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-300/80 bg-teal-950/80 px-1.5 py-0.5 rounded">
              Alt+A
            </span>
          </button>
        </div>
      )}

      {/* Bottom Legal Anchor */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-800" />
          <span>Statutory Framework</span>
        </span>
        <span className="text-[10px] font-mono text-slate-400">AYUSH v2.4</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left Rail */}
      <aside id="desktop-left-rail" className="hidden lg:block h-full">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div
          id="mobile-left-rail-drawer"
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-50 max-w-xs w-full shadow-2xl h-full">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
