import React from 'react';
import {
  Globe2,
  Languages,
  Info,
  Layers,
  Menu,
  FileCheck2,
  ChevronDown,
  Database,
} from 'lucide-react';
import { Jurisdiction, Language } from '../types';

interface TopBarProps {
  jurisdiction: Jurisdiction;
  onToggleJurisdiction: () => void;
  language: Language;
  onToggleLanguage: () => void;
  onOpenDisclaimer: () => void;
  onOpenDbStatus: () => void;
  onToggleMobileLeftRail: () => void;
  onToggleMobileRightRail: () => void;
  isMobileRightRailOpen: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  jurisdiction,
  onToggleJurisdiction,
  language,
  onToggleLanguage,
  onOpenDisclaimer,
  onOpenDbStatus,
  onToggleMobileLeftRail,
  onToggleMobileRightRail,
  isMobileRightRailOpen,
}) => {
  return (
    <header
      id="app-topbar"
      className="bg-[#0B3B32] text-white border-b border-[#082a24] shadow-xs px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 select-none"
    >
      {/* Brand Identity / Logo */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Mobile Left Menu Button */}
        <button
          id="mobile-left-rail-toggle"
          onClick={onToggleMobileLeftRail}
          className="lg:hidden p-2 rounded-lg text-emerald-100 hover:text-white hover:bg-teal-900/70 transition-colors"
          aria-label="Toggle Navigation & Prompts"
          title="Open Quick-Start Prompts"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Official Insignia Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-teal-950 border border-teal-600/40 flex items-center justify-center shadow-inner text-emerald-300">
            <span className="font-display font-bold text-sm tracking-wider">IP</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1
                id="app-brand-title"
                className="text-base sm:text-lg font-bold tracking-tight text-white font-display"
              >
                IP-SAKTI Sahayak
              </h1>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 uppercase tracking-wider">
                AYURVEDA REGULATORY & IP
              </span>
            </div>
            <p className="text-[11px] text-teal-200/90 hidden sm:block font-normal">
              {language === 'Hindi'
                ? 'आयुर्वेद बौद्धिक संपदा एवं विनियामक परामर्श तंत्र'
                : 'Intellectual Property & Statutory Compliance Intelligence'}
            </p>
          </div>
        </div>
      </div>

      {/* Controls & Interactive Chips */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Jurisdiction Chip */}
        <button
          id="jurisdiction-chip-button"
          onClick={onToggleJurisdiction}
          className={`group flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 shadow-xs cursor-pointer ${
            jurisdiction === 'India'
              ? 'bg-teal-900/90 text-emerald-100 border-teal-600/70 hover:bg-teal-800'
              : 'bg-indigo-950/80 text-indigo-100 border-indigo-500/70 hover:bg-indigo-900'
          }`}
          title="Tap to switch between Indian and International regulatory regimes"
          aria-label={`Current jurisdiction is ${jurisdiction}. Tap to switch.`}
        >
          <Globe2 className="w-3.5 h-3.5 text-emerald-300 shrink-0 group-hover:rotate-12 transition-transform" />
          <span className="text-[11px] text-teal-300/80 uppercase font-semibold hidden md:inline">
            Jurisdiction:
          </span>
          <span className="font-semibold text-white">
            {jurisdiction}
          </span>
          <span className="text-[10px] text-teal-300/70 font-mono hidden sm:inline">
            (Tap)
          </span>
          <ChevronDown className="w-3 h-3 text-teal-300/70 opacity-60" />
        </button>

        {/* Language Chip */}
        <button
          id="language-chip-button"
          onClick={onToggleLanguage}
          className="group flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium bg-teal-900/70 hover:bg-teal-800 border border-teal-700/60 text-white transition-colors cursor-pointer shadow-xs"
          title="Tap to switch language between English and Hindi"
          aria-label={`Current language is ${language}. Tap to switch.`}
        >
          <Languages className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <span className="text-[11px] text-teal-300/80 uppercase font-semibold hidden md:inline">
            Language:
          </span>
          <span className="font-semibold text-white">
            {language === 'English' ? 'English' : 'हिंदी'}
          </span>
          <span className="text-[10px] text-teal-300/70 font-mono hidden sm:inline">
            (Tap)
          </span>
          <ChevronDown className="w-3 h-3 text-teal-300/70 opacity-60" />
        </button>

        {/* Database / Supabase Schema Button */}
        <button
          id="db-status-trigger-btn"
          onClick={onOpenDbStatus}
          className="flex items-center space-x-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-full bg-teal-950/80 hover:bg-teal-900 text-teal-200 hover:text-white border border-teal-700/50 transition-colors text-xs font-medium cursor-pointer"
          title="Supabase Postgres & Vector(768) Registry"
          aria-label="Database Status & Schema"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="hidden xl:inline text-xs text-teal-100">Database</span>
        </button>

        {/* Disclaimer Icon Button */}
        <button
          id="legal-disclaimer-trigger-btn"
          onClick={onOpenDisclaimer}
          className="flex items-center space-x-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-full bg-teal-950/80 hover:bg-teal-900 text-teal-200 hover:text-white border border-teal-700/50 transition-colors text-xs font-medium cursor-pointer"
          title="Standing Legal Disclaimer & Advisory Terms"
          aria-label="Standing Legal Disclaimer"
        >
          <Info className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="hidden xl:inline text-xs text-teal-100">Disclaimer</span>
        </button>

        {/* Mobile Right Rail Toggle Button */}
        <button
          id="mobile-right-rail-toggle"
          onClick={onToggleMobileRightRail}
          className={`lg:hidden flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isMobileRightRailOpen
              ? 'bg-teal-800 border-teal-500 text-white'
              : 'bg-teal-950/90 border-teal-700/60 text-teal-200 hover:text-white'
          }`}
          aria-label="Toggle Classification & Sources Panel"
          title="View Classification & Sources"
        >
          <FileCheck2 className="w-4 h-4" />
          <span className="text-xs">Summary</span>
        </button>
      </div>
    </header>
  );
};
