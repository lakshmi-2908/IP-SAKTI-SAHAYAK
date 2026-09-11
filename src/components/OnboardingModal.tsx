import React, { useState } from 'react';
import {
  Globe2,
  Languages,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Scale,
  Sparkles,
  Check,
} from 'lucide-react';
import { Jurisdiction, Language } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (jurisdiction: Jurisdiction, language: Language) => void;
  initialJurisdiction: Jurisdiction;
  initialLanguage: Language;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  initialJurisdiction,
  initialLanguage,
}) => {
  const [selectedJurisdiction, setSelectedJurisdiction] =
    useState<Jurisdiction>(initialJurisdiction);
  const [selectedLanguage, setSelectedLanguage] =
    useState<Language>(initialLanguage);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(selectedJurisdiction, selectedLanguage);
  };

  return (
    <div
      id="onboarding-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="onboarding-card"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header with National/Ayush Identity */}
        <div className="bg-[#0B3B32] text-white px-6 py-5 border-b border-teal-900">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-teal-950 border border-teal-700/60 text-emerald-300">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-bold tracking-tight text-white font-display">
                  IP-SAKTI Sahayak
                </h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Ayush IP AI
                </span>
              </div>
              <p className="text-xs text-teal-200 mt-0.5">
                Statutory Intellectual Property & Formulation Regulatory Navigator
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Statutory Scope & Legal Limitation Notice */}
          <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-xs text-amber-950 flex items-start space-x-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-amber-900 block mb-0.5">
                Advisory Notice & Jurisdictional Boundary
              </span>
              IP-SAKTI Sahayak delivers computational indexing across statutory patent guidelines,
              TKDL monographs, and AYUSH licensing regulations.
              <strong className="font-semibold text-amber-950">
                {' '}This service provides guidance and compliance information, not formal legal advice.
              </strong>{' '}
              Official patent prosecution and court actions require consultation with a registered patent attorney or regulatory officer.
            </div>
          </div>

          {/* Section 1: Jurisdiction Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 text-teal-800" />
                Select Regulatory Jurisdiction
              </span>
              <span className="text-[11px] font-normal lowercase text-slate-500">
                (Switchable anytime)
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="onboard-jurisdiction-india"
                onClick={() => setSelectedJurisdiction('India')}
                className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedJurisdiction === 'India'
                    ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-700/20 text-teal-950'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm">India (AYUSH / IPO)</span>
                  {selectedJurisdiction === 'India' && (
                    <Check className="w-4 h-4 text-teal-700" />
                  )}
                </div>
                <span className="text-[11px] text-slate-500 mt-1">
                  Indian Patent Act Sec 3(p), TKDL, Biological Diversity Act, Drugs & Cosmetics Act
                </span>
              </button>

              <button
                type="button"
                id="onboard-jurisdiction-intl"
                onClick={() => setSelectedJurisdiction('International')}
                className={`flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedJurisdiction === 'International'
                    ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-700/20 text-teal-950'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm">International</span>
                  {selectedJurisdiction === 'International' && (
                    <Check className="w-4 h-4 text-teal-700" />
                  )}
                </div>
                <span className="text-[11px] text-slate-500 mt-1">
                  PCT, USPTO, EPO, WIPO Traditional Knowledge & Nagoya Protocol compliance
                </span>
              </button>
            </div>
          </div>

          {/* Section 2: Language Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-teal-800" />
                Select Preferred Language
              </span>
              <span className="text-[11px] font-normal lowercase text-slate-500">
                (Switchable anytime)
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="onboard-language-en"
                onClick={() => setSelectedLanguage('English')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedLanguage === 'English'
                    ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-700/20 text-teal-950 font-bold'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700 font-medium'
                }`}
              >
                <div>
                  <div className="text-sm">English</div>
                  <div className="text-[10px] text-slate-500 font-normal">
                    Statutory nomenclature & reports
                  </div>
                </div>
                {selectedLanguage === 'English' && (
                  <Check className="w-4 h-4 text-teal-700" />
                )}
              </button>

              <button
                type="button"
                id="onboard-language-hi"
                onClick={() => setSelectedLanguage('Hindi')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedLanguage === 'Hindi'
                    ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-700/20 text-teal-950 font-bold'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700 font-medium'
                }`}
              >
                <div>
                  <div className="text-sm">हिंदी (Hindi)</div>
                  <div className="text-[10px] text-slate-500 font-normal">
                    पारंपरिक ज्ञान एवं विधिक मार्गदर्शन
                  </div>
                </div>
                {selectedLanguage === 'Hindi' && (
                  <Check className="w-4 h-4 text-teal-700" />
                )}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="onboard-submit-button"
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-[#0B3B32] hover:bg-[#125447] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <span>Initialize Workspace & Unlock Console</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
