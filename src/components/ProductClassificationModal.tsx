import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, AlertCircle, FileText, CheckCircle2, HelpCircle } from 'lucide-react';
import { ClassifyProductFormData, ProductClassificationSummary } from '../types';

interface ProductClassificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: ClassifyProductFormData) => Promise<void>;
  initialData?: ClassifyProductFormData | null;
  pendingQuestion?: string | null;
  isSubmitting?: boolean;
}

export const ProductClassificationModal: React.FC<ProductClassificationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  pendingQuestion,
  isSubmitting = false,
}) => {
  const [productNameOrDescription, setProductNameOrDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [formulationBasis, setFormulationBasis] = useState<'classical' | 'modified_proprietary' | 'novel'>('classical');
  const [intendedUse, setIntendedUse] = useState<'therapeutic' | 'dietary_nutraceutical' | 'cosmetic'>('therapeutic');
  const [existingLicence, setExistingLicence] = useState<'yes' | 'no' | 'not_sure'>('no');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setProductNameOrDescription(initialData.productNameOrDescription || '');
      setIngredients(initialData.ingredients || '');
      setFormulationBasis(initialData.formulationBasis || 'classical');
      setIntendedUse(initialData.intendedUse || 'therapeutic');
      setExistingLicence(initialData.existingLicence || 'no');
    } else if (pendingQuestion) {
      // If triggered automatically by a question mentioning a product, pre-fill as initial hint
      setProductNameOrDescription((prev) => (prev ? prev : pendingQuestion.slice(0, 120)));
    }
  }, [initialData, pendingQuestion, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productNameOrDescription.trim()) {
      setError('Please provide a product or formulation name/description.');
      return;
    }
    setError(null);

    const formData: ClassifyProductFormData = {
      productNameOrDescription: productNameOrDescription.trim(),
      ingredients: ingredients.trim(),
      formulationBasis,
      intendedUse,
      existingLicence,
    };

    try {
      await onSubmit(formData);
    } catch (err: any) {
      setError(err?.message || 'Classification failed. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        id="product-classification-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSubmitting) onClose();
        }}
      >
        <motion.div
          id="product-classification-modal-dialog"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden my-6"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-5 h-5 text-emerald-100" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                  Classify Your Formulation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  AYUSH &amp; CDSCO Regulatory Categorization Intake
                </p>
              </div>
            </div>
            <button
              id="close-classification-modal"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {pendingQuestion && !initialData && (
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Automatic Regulatory Verification:</span> We noticed your inquiry refers to a specific product or recipe. Completing this intake equips the system to cite relevant drug licensing rules (e.g. Rule 158B, TKDL exemptions) for your consultation.
                </div>
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Field 1: Name or description */}
            <div>
              <label
                htmlFor="product-name-input"
                className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5"
              >
                1. Product / Formulation Name or Description <span className="text-rose-500">*</span>
              </label>
              <input
                id="product-name-input"
                type="text"
                value={productNameOrDescription}
                onChange={(e) => setProductNameOrDescription(e.target.value)}
                placeholder="e.g., Ashwagandha &amp; Brahmi memory syrup, or Rasayana tablet"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Field 2: Ingredients */}
            <div>
              <label
                htmlFor="ingredients-input"
                className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5"
              >
                2. Ingredients &amp; Botanicals <span className="text-slate-400 font-normal normal-case">(free text)</span>
              </label>
              <textarea
                id="ingredients-input"
                rows={2}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                placeholder="e.g., Withania somnifera (root extract), Bacopa monnieri, Honey, Ghee"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                disabled={isSubmitting}
              />
            </div>

            {/* Field 3: Formulation Basis */}
            <div>
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                3. Formulation Basis <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Is this based on a classical text formulation, a modified/proprietary combination, or a completely novel combination?
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  id="basis-classical"
                  type="button"
                  onClick={() => setFormulationBasis('classical')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                    formulationBasis === 'classical'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Classical Text</span>
                  <span className="text-[10px] text-slate-500 mt-1">From First Schedule texts (Charaka, Sushruta, etc.)</span>
                </button>

                <button
                  id="basis-modified"
                  type="button"
                  onClick={() => setFormulationBasis('modified_proprietary')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                    formulationBasis === 'modified_proprietary'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Modified / Proprietary</span>
                  <span className="text-[10px] text-slate-500 mt-1">Classical ingredients in altered ratios or modern forms</span>
                </button>

                <button
                  id="basis-novel"
                  type="button"
                  onClick={() => setFormulationBasis('novel')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                    formulationBasis === 'novel'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Novel Combination</span>
                  <span className="text-[10px] text-slate-500 mt-1">New botanical fraction or unlisted clinical blend</span>
                </button>
              </div>
            </div>

            {/* Field 4: Intended Use */}
            <div>
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                4. Primary Intended Use <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  id="use-therapeutic"
                  type="button"
                  onClick={() => setIntendedUse('therapeutic')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                    intendedUse === 'therapeutic'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Therapeutic / Medicinal</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Disease treatment or cure claims</span>
                </button>

                <button
                  id="use-dietary"
                  type="button"
                  onClick={() => setIntendedUse('dietary_nutraceutical')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                    intendedUse === 'dietary_nutraceutical'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Dietary / Nutraceutical</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ayurveda Aahar or wellness supplement</span>
                </button>

                <button
                  id="use-cosmetic"
                  type="button"
                  onClick={() => setIntendedUse('cosmetic')}
                  disabled={isSubmitting}
                  className={`px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                    intendedUse === 'cosmetic'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold block">Cosmetic / Topical</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Skin, hair, or external care without cure claims</span>
                </button>
              </div>
            </div>

            {/* Field 5: Existing Licence */}
            <div>
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                5. Currently Manufactured Under Existing Licence? <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  id="licence-yes"
                  type="button"
                  onClick={() => setExistingLicence('yes')}
                  disabled={isSubmitting}
                  className={`px-3 py-2 rounded-xl border text-center text-xs transition-all ${
                    existingLicence === 'yes'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Yes
                </button>

                <button
                  id="licence-no"
                  type="button"
                  onClick={() => setExistingLicence('no')}
                  disabled={isSubmitting}
                  className={`px-3 py-2 rounded-xl border text-center text-xs transition-all ${
                    existingLicence === 'no'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  No
                </button>

                <button
                  id="licence-not-sure"
                  type="button"
                  onClick={() => setExistingLicence('not_sure')}
                  disabled={isSubmitting}
                  className={`px-3 py-2 rounded-xl border text-center text-xs transition-all ${
                    existingLicence === 'not_sure'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Not Sure
                </button>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                id="cancel-classification-button"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="submit-classification-button"
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing Taxonomy...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Classify Product</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
