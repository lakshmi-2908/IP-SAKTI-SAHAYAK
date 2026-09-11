export type Jurisdiction = 'India' | 'International';
export type Language = 'English' | 'Hindi';

export interface CitedChunkInfo {
  chunk_id: string;
  sectionLabel?: string;
  snippet?: string;
  fullText?: string;
  citedSentence?: string;
  hindiParaphrase?: string;
  timestamp?: string;
  turnIndex?: number;
}

export interface SourceCitation {
  id: string;
  number?: number;
  chunk_id?: string;
  document_id?: string;
  documentTitle?: string;
  authority?: string | null;
  sectionLabel?: string | null;
  snippet?: string;
  fullText?: string;
  sourceUrl?: string | null;
  timesCited?: number;
  jurisdiction?: Jurisdiction | string;
  language?: string;
  category?: string;
  citedSentence?: string;
  hindiParaphrase?: string;
  citedChunks?: CitedChunkInfo[];
  // Backward-compatible properties
  actOrBody?: string;
  sectionOrArticle?: string;
  title?: string;
  url?: string;
}

export interface DocumentDetail {
  id: string;
  title: string;
  authority: string | null;
  jurisdiction: string;
  category: string | null;
  language: string;
  source_url: string | null;
  upload_date?: string;
  status?: string;
  version?: number;
}

export interface ChunkDetail {
  id: string;
  document_id: string;
  text: string;
  section_label: string;
  jurisdiction: string;
  category: string | null;
  language: string;
}

export interface JurisdictionSection {
  jurisdiction: 'india' | 'international';
  sectionLabel: string;
  answer: string;
  citations: SourceCitation[];
  confidence: 'high' | 'medium' | 'low';
  shouldEscalate?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: string;
  content: string;
  originalQuestion?: string;
  translatedQuery?: string;
  citations?: SourceCitation[];
  confidence?: 'high' | 'medium' | 'low';
  shouldEscalate?: boolean;
  feedback?: 'up' | 'down' | null;
  isDemo?: boolean;
  isDualJurisdiction?: boolean;
  sections?: JurisdictionSection[];
}

export interface ClassifyProductFormData {
  productNameOrDescription: string;
  ingredients: string;
  formulationBasis: 'classical' | 'modified_proprietary' | 'novel';
  intendedUse: 'therapeutic' | 'dietary_nutraceutical' | 'cosmetic';
  existingLicence: 'yes' | 'no' | 'not_sure';
}

export interface ProductClassificationSummary {
  productName?: string;
  categoryName?: string;
  categoryDefinition?: string;
  regulatoryPathway?: string;
  confidence?: 'high' | 'medium' | 'low';
  clarifyingQuestion?: string | null;
  rawInputs?: ClassifyProductFormData;
  ayurvedicCategory?: string; // Classical / Proprietary / Patent / ASU Dietary Supplement
  regulatoryRegime?: string; // Rule 158B / Section 3(a) / FSSAI / FDA NDI
  scheduledTextsReference?: string;
  clinicalSafetyRequired?: boolean;
  tkdlStatus?: string;
  isClassified: boolean;
}
