import React, { useState } from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  Scale,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AYURVEDIC_TEST_SUITE, BenchmarkTestQuestion } from './AdminPortal';

interface AdminBenchmarksViewProps {
  onRunTestQuestion: (question: string, jurisdiction: 'india' | 'international') => void;
  onSwitchToDiagnostic: () => void;
}

export const AdminBenchmarksView: React.FC<AdminBenchmarksViewProps> = ({
  onRunTestQuestion,
  onSwitchToDiagnostic,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedBenchIds, setExpandedBenchIds] = useState<Record<string, boolean>>({});

  const toggleBench = (id: string) => {
    setExpandedBenchIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const categories = ['all', ...Array.from(new Set(AYURVEDIC_TEST_SUITE.map((q) => q.category)))];

  const filteredQuestions = AYURVEDIC_TEST_SUITE.filter((q) => {
    if (selectedCategory !== 'all' && q.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-50 text-amber-800">
              <Award className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>AYUSH & Ayurvedic Regulatory Ground Truth Benchmark Suite</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  7 Curated Ground-Truth Questions
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Statutory and classical test suite covering Sneha Kalpana (Paka Lakshana), Avaleha, Bhasma Pariksha, Rule 161B shelf-life, Section 3(p) TKDL patentability, Rule 158B licensing, and Section 6 NBA biodiversity approvals.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSwitchToDiagnostic}
            className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-teal-800" />
            <span>Open Diagnostic Live Inspector</span>
          </button>
        </div>

        {/* Category Filters */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">
            Topic Filter:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#0B3B32] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'All Questions (7)' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Benchmark List */}
      <div className="space-y-4">
        {filteredQuestions.map((benchmark, idx) => {
          const isExpanded = !!expandedBenchIds[benchmark.id];

          return (
            <div
              key={benchmark.id}
              id={`benchmark-card-${benchmark.id}`}
              className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
            >
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-900 border border-amber-200">
                        {benchmark.category}
                      </span>
                      <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {benchmark.formulation}
                      </span>
                      <span className="px-2 py-0.5 rounded-md font-semibold bg-teal-50 text-teal-900 border border-teal-200 uppercase">
                        {benchmark.recommendedJurisdiction}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 pt-1 leading-snug">
                      {idx + 1}. {benchmark.question}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRunTestQuestion(benchmark.question, benchmark.recommendedJurisdiction)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B3B32] hover:bg-[#125447] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                    title="Run diagnostic vector retrieval test for this question"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Diagnostic Test</span>
                  </button>
                </div>

                {/* Ground Truth Preview */}
                <div className="mt-3.5 p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-xs space-y-1.5">
                  <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Expected Statutory Ground Truth:</span>
                  </div>
                  <p className="text-emerald-900 leading-relaxed font-serif text-[13px]">
                    {benchmark.expectedAnswerSummary}
                  </p>
                  <div className="text-[11px] text-emerald-700 font-semibold pt-0.5">
                    Citation Source: {benchmark.statutoryReference}
                  </div>
                </div>

                {/* Collapsible Diagnostic Purpose */}
                <div className="mt-3 flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => toggleBench(benchmark.id)}
                    className="text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        <span>Hide Retrieval Objectives</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        <span>View Retrieval Objectives & Validation Criteria</span>
                      </>
                    )}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    ID: {benchmark.id}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
                    <div>
                      <span className="font-bold text-slate-800">What this tests in the RAG pipeline:</span>
                      <p className="text-slate-600 mt-0.5 leading-relaxed">
                        {benchmark.diagnosticExplanation}
                      </p>
                    </div>
                    <div className="text-slate-500">
                      <strong>Expected Citation:</strong> {benchmark.statutoryReference}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
