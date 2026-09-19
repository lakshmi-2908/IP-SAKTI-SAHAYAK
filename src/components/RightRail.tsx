import React, { useState } from 'react';
import {
  FileText,
  Bookmark,
  ExternalLink,
  HelpCircle,
  X,
  ChevronRight,
  Sparkles,
  Layers,
  FileCheck,
  Building,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ProductClassificationSummary, SourceCitation } from '../types';

interface RightRailProps {
  classification: ProductClassificationSummary;
  sources: SourceCitation[];
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  language: 'English' | 'Hindi';
  onOpenSource?: (source: SourceCitation) => void;
  onEditClassification?: () => void;
  onOpenClassifyProduct?: () => void;
}

export const RightRail: React.FC<RightRailProps> = ({
  classification,
  sources,
  isOpenMobile,
  onCloseMobile,
  language,
  onOpenSource,
  onEditClassification,
  onOpenClassifyProduct,
}) => {
  // Scaffolding demo preview toggle to inspect both empty state and populated mock state
  const [showDemoPreview, setShowDemoPreview] = useState<boolean>(false);

  // Demo populated state with every placeholder prefixed with "[DEMO]"
  const demoClassification = {
    productName: '[DEMO] Ashwagandha Enhanced Aqueous Extract Capsule',
    ayurvedicCategory: '[DEMO] Proprietary Ayurvedic Medicine (Rule 158B)',
    regulatoryRegime: '[DEMO] Ayush Manufacturing Licence Form 25D',
    scheduledTextsReference: '[DEMO] Formulated with Withania somnifera per Ayurvedic Pharmacopoeia of India (API) Part I, Vol I',
    clinicalSafetyRequired: true,
    tkdlStatus: '[DEMO] Prior art referenced in Traditional Knowledge Digital Library (TKDL) - TKDL ID: JA7/1202',
    isClassified: true,
  };

  const demoSources: SourceCitation[] = [
    {
      id: 'demo-src-1',
      actOrBody: '[DEMO] The Patents Act, 1970',
      sectionOrArticle: '[DEMO] Section 3(p)',
      title: '[DEMO] Inventions relating to traditional knowledge or aggregation of known properties',
      jurisdiction: 'India',
      url: 'https://ipindia.gov.in',
    },
    {
      id: 'demo-src-2',
      actOrBody: '[DEMO] Drugs and Cosmetics Rules, 1945',
      sectionOrArticle: '[DEMO] Rule 158B',
      title: '[DEMO] Guidelines for issue of licence in respect of Ayurveda, Siddha or Unani drugs',
      jurisdiction: 'India',
    },
    {
      id: 'demo-src-3',
      actOrBody: '[DEMO] Traditional Knowledge Digital Library (TKDL)',
      sectionOrArticle: '[DEMO] CSIR-AYUSH Repository',
      title: '[DEMO] Prior-art defensive database documentation on Withania somnifera applications',
      jurisdiction: 'India',
    },
  ];

  const activeClassification = showDemoPreview ? demoClassification : classification;
  const activeSources = showDemoPreview ? demoSources : sources;

  const railContent = (
    <div className="flex flex-col h-full bg-[#FAFCFB] border-l border-slate-200 w-80 lg:w-88 shrink-0 overflow-hidden">
      {/* Rail Header */}
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display flex items-center gap-1.5">
            <FileCheck className="w-4 h-4 text-teal-800" />
            <span>Regulatory Ledger</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            {language === 'Hindi' ? 'वर्गीकरण एवं वैधानिक संदर्भ' : 'Classification & Statutory Citations'}
          </p>
        </div>

        {/* Close Button on Mobile */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100"
          aria-label="Close summary sheet"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Demo Inspector Control (Temporary scaffolding to inspect populated state vs empty state) */}
      <div className="px-4 py-2 bg-teal-900/5 border-b border-teal-800/10 flex items-center justify-between text-[11px]">
        <span className="text-teal-900 font-medium flex items-center gap-1">
          <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-teal-800/10 text-teal-800">
            [DEMO]
          </span>
          Mock Layout Preview
        </span>
        <button
          id="toggle-demo-preview-button"
          onClick={() => setShowDemoPreview(!showDemoPreview)}
          className="text-teal-800 hover:text-teal-950 font-semibold underline underline-offset-2 cursor-pointer transition-colors text-[11px]"
        >
          {showDemoPreview ? 'Show Empty State' : 'Preview Populated State'}
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        {/* Card 1: Product Classification Summary Card */}
        <div
          id="product-classification-card"
          className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-teal-800" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Product classification
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {activeClassification.isClassified && (
                <>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Classified
                  </span>
                  {onEditClassification && (
                    <button
                      id="edit-classification-button"
                      type="button"
                      onClick={onEditClassification}
                      className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer px-1 py-0.5 transition-colors"
                      title="Redo form and reclassify"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="p-4">
            {!activeClassification.isClassified ? (
              // Empty State: "Not yet classified"
              <div
                id="classification-empty-state"
                className="py-6 px-3 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50"
              >
                <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <HelpCircle className="w-5 h-5 text-slate-400" />
                </div>
                <h4 className="text-sm font-semibold text-slate-700">
                  Not yet classified
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed mb-3">
                  Provide ingredients, indications, or preparation details in chat to assess drug vs food categorization.
                </p>
                {onOpenClassifyProduct && (
                  <button
                    id="open-classification-button-from-rail"
                    type="button"
                    onClick={onOpenClassifyProduct}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Classify Product</span>
                  </button>
                )}
              </div>
            ) : (
              // Populated State matching Prompt 8
              <div id="classification-populated-state" className="space-y-3.5 text-xs">
                {activeClassification.productName && (
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Product Name / Description
                    </span>
                    <p className="font-semibold text-slate-900 mt-0.5 leading-snug">
                      {activeClassification.productName}
                    </p>
                  </div>
                )}

                {/* Category Name & Definition */}
                <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/80">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                      Statutory Category
                    </span>
                    {activeClassification.confidence && (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                          activeClassification.confidence === 'high'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : activeClassification.confidence === 'medium'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {activeClassification.confidence.toUpperCase()} CONFIDENCE
                      </span>
                    )}
                  </div>
                  <p className="text-emerald-950 font-bold text-xs mt-0.5">
                    {activeClassification.categoryName || activeClassification.ayurvedicCategory}
                  </p>
                  {activeClassification.categoryDefinition && (
                    <p className="text-emerald-800/90 text-[11px] mt-1 leading-relaxed border-t border-emerald-200/60 pt-1.5">
                      {activeClassification.categoryDefinition}
                    </p>
                  )}
                </div>

                {/* Regulatory Pathway */}
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Applicable Regulatory Pathway
                  </span>
                  <p className="text-slate-800 mt-0.5 font-medium leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    {activeClassification.regulatoryPathway || activeClassification.regulatoryRegime || 'AYUSH Drug Licencing & CDSCO Regulations'}
                  </p>
                </div>

                {/* Clarifying Question / Note if confidence is not high */}
                {activeClassification.clarifyingQuestion && (
                  <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                        Clarification Point
                      </span>
                      <p className="text-[11px] mt-0.5 leading-snug">
                        {activeClassification.clarifyingQuestion}
                      </p>
                    </div>
                  </div>
                )}

                {/* Scheduled Texts Reference if available */}
                {activeClassification.scheduledTextsReference && (
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Authoritative Text Reference
                    </span>
                    <p className="text-slate-600 mt-0.5 leading-relaxed text-[11px]">
                      {activeClassification.scheduledTextsReference}
                    </p>
                  </div>
                )}

                {/* TKDL Status if available */}
                {activeClassification.tkdlStatus && (
                  <div className="pt-2 border-t border-slate-100 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {activeClassification.tkdlStatus}
                    </p>
                  </div>
                )}

                {/* Bottom Edit Action */}
                {onEditClassification && (
                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={onEditClassification}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Edit &amp; Reclassify</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Sources used in this conversation */}
        <div
          id="conversation-sources-card"
          className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
        >
          <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bookmark className="w-4 h-4 text-teal-800" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Sources used in this conversation
              </h3>
            </div>
            {activeSources.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800">
                {activeSources.length} Cited
              </span>
            )}
          </div>

          <div className="p-4">
            {activeSources.length === 0 ? (
              // Empty State: "No sources yet"
              <div
                id="sources-empty-state"
                className="py-7 px-3 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50"
              >
                <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <Bookmark className="w-5 h-5 text-slate-400" />
                </div>
                <h4 className="text-sm font-semibold text-slate-700">
                  No sources yet
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  As questions are answered, relevant statutory provisions, pharmacopoeia monographs, and judicial precedents will appear here.
                </p>
              </div>
            ) : (
              // Populated State
              <div id="sources-populated-state" className="space-y-2.5">
                {activeSources.map((source, idx) => {
                  const docTitle = source.documentTitle || source.title || source.actOrBody || 'Statutory Source';
                  const authority = source.authority || source.actOrBody || 'Ayush Regulatory Corpus';
                  const section = source.sectionLabel || source.sectionOrArticle;
                  const timesCited = source.timesCited;

                  return (
                    <div
                      key={source.id || `src-${idx}`}
                      onClick={() => onOpenSource?.(source)}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-100/90 hover:border-teal-400/60 transition-all text-xs cursor-pointer group shadow-2xs"
                      title="Click to inspect official statutory document & excerpt"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-teal-950 truncate group-hover:text-teal-800">
                          {docTitle}
                        </span>
                        {section && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-teal-800/10 text-teal-900 rounded font-mono shrink-0">
                            {section}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate max-w-[170px]">{authority}</span>
                        {timesCited && timesCited > 1 && (
                          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-200 shrink-0">
                            Cited {timesCited}x
                          </span>
                        )}
                      </div>
                      {source.snippet && (
                        <p className="text-slate-600 text-[10.5px] mt-1.5 line-clamp-2 leading-relaxed font-serif italic text-slate-700 bg-white/60 p-1.5 rounded border border-slate-100">
                          "{source.snippet}"
                        </p>
                      )}
                      {source.hindiParaphrase && (
                        <p className="text-teal-950 font-sans text-[10px] mt-1 line-clamp-2 leading-snug bg-teal-50/80 p-1.5 rounded border border-teal-200/80">
                          <span className="font-bold text-teal-900">भावार्थ: </span>
                          <span>"{source.hindiParaphrase}"</span>
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-teal-800 font-medium pt-1 border-t border-slate-200/60">
                        <span className="flex items-center gap-1 group-hover:underline">
                          <span>View Official Passage</span>
                          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                        {source.url && <ExternalLink className="w-2.5 h-2.5 text-slate-400" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Standard Citation Legend */}
        <div className="p-3 bg-slate-100/70 rounded-lg border border-slate-200 text-[11px] text-slate-500 space-y-1.5">
          <div className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-teal-800" />
            <span>Citation Authority Index</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-normal">
            Sources cross-reference the Ayurvedic Pharmacopoeia of India (API), Schedule T GMP, CSIR-TKDL, and Intellectual Property India gazettes.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Rail */}
      <aside id="desktop-right-rail" className="hidden lg:block h-full">
        {railContent}
      </aside>

      {/* Mobile Bottom Sheet */}
      {isOpenMobile && (
        <div
          id="mobile-right-rail-bottom-sheet"
          className="fixed inset-0 z-40 lg:hidden flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Bottom Sheet Modal Container */}
          <div className="relative z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] h-[80vh] flex flex-col w-full overflow-hidden border-t border-slate-200">
            {/* Sheet Handle */}
            <div className="w-full flex justify-center py-2 bg-white">
              <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
            </div>
            <div className="flex-1 overflow-hidden">{railContent}</div>
          </div>
        </div>
      )}
    </>
  );
};
