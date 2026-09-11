import React, { useEffect } from 'react';
import { ShieldAlert, X, Scale, AlertCircle } from 'lucide-react';

interface LegalDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'English' | 'Hindi';
}

export const LegalDisclaimerModal: React.FC<LegalDisclaimerModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      id="legal-disclaimer-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div
        id="legal-disclaimer-modal"
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0B3B32] text-white px-6 py-4 flex items-center justify-between border-b border-teal-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-teal-900/80 border border-teal-700/50 text-emerald-300">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id="disclaimer-title" className="text-base font-semibold text-white tracking-wide">
                {language === 'Hindi' ? 'वैधानिक अस्वीकरण (Legal Disclaimer)' : 'Standing Legal & Regulatory Disclaimer'}
              </h2>
              <p className="text-xs text-teal-200">
                {language === 'Hindi' ? 'आयुर्वेद बौद्धिक संपदा एवं विनियामक परामर्श' : 'Ayurveda Intellectual Property & Regulatory Notice'}
              </p>
            </div>
          </div>
          <button
            id="close-disclaimer-button"
            onClick={onClose}
            className="p-1.5 text-teal-200 hover:text-white rounded-md hover:bg-teal-800 transition-colors"
            aria-label="Close disclaimer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm text-slate-700 leading-relaxed max-h-[70vh] overflow-y-auto">
          <div className="flex items-start space-x-3 p-3.5 bg-amber-50 rounded-lg border border-amber-200/80">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 font-medium leading-relaxed">
              <strong>{language === 'Hindi' ? 'महत्वपूर्ण सूचना: ' : 'Important Notice: '}</strong>
              {language === 'Hindi'
                ? 'यह प्रणाली केवल प्रारंभिक जानकारी और अनुसंधान मार्गदर्शन के लिए है। यह आधिकारिक कानूनी सलाह नहीं है।'
                : 'IP-SAKTI Sahayak provides automated informational guidance and regulatory indexing. It does not provide formal legal counsel or statutory binding clearances.'}
            </div>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-slate-600">
            <p>
              <strong>1. Regulatory Scope:</strong> Guidance referencing the Drugs and Cosmetics Act 1940, Drugs and Cosmetics Rules 1945 (including Rule 158B for Ayurvedic Classical and Proprietary Medicines), the Patents Act 1970 (specifically Sections 3(p), 3(d), and 3(e)), the Biological Diversity Act 2002, and TKDL (Traditional Knowledge Digital Library) citations is compiled for institutional research and compliance navigation.
            </p>
            <p>
              <strong>2. International Regimes:</strong> Cross-border assessments (e.g. US FDA Dietary Supplement Health and Education Act (DSHEA), European Medicines Agency (EMA) Traditional Herbal Medicinal Products Directive 2004/24/EC, and WHO Guidelines) are synthetic summaries subject to evolving country-specific phytosanitary and border regulations.
            </p>
            <p>
              <strong>3. Requirement of Certified Counsel:</strong> Users must verify all patent novelty parameters, prior-art disclosures, Schedule T Good Manufacturing Practices (GMP), and product licensing with a qualified patent attorney and the state AYUSH licensing authority prior to commercialization or filing.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-700" />
              IP-SAKTI Advisory Protocol v1.0
            </span>
            <span>AYUSH / CDSCO / WIPO Index</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            id="acknowledge-disclaimer-btn"
            onClick={onClose}
            className="px-4 py-2 bg-[#0B3B32] hover:bg-[#125447] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            {language === 'Hindi' ? 'स्वीकार करें एवं आगे बढ़ें' : 'I Understand & Acknowledge'}
          </button>
        </div>
      </div>
    </div>
  );
};
