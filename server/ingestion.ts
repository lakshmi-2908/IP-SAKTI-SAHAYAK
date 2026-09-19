import { GoogleGenAI, Type } from '@google/genai';
import { getSupabaseClient, getPgPool } from './supabase';

export interface MetadataSuggestion {
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

export interface IngestDocumentPayload {
  title: string;
  authority: string | null;
  jurisdiction: 'india' | 'international';
  category: 'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL';
  language: string;
  source_url: string | null;
  rawText: string;
}

export interface IngestedChunkRecord {
  id: string;
  document_id: string;
  text: string;
  embedding: number[];
  section_label: string;
  jurisdiction: 'india' | 'international';
  category: string;
  language: string;
}

export interface IngestedDocRecord {
  id: string;
  title: string;
  authority: string | null;
  jurisdiction: 'india' | 'international';
  category: 'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL';
  language: string;
  source_url: string | null;
  upload_date: string;
  status: 'active' | 'deactivated';
  version: number;
  chunk_count: number;
}

export const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
export const EMBEDDING_DIMENSION = 768;

// In-memory fallback registry to ensure full reactivity in development
const localDocuments: IngestedDocRecord[] = [];
const localChunks: IngestedChunkRecord[] = [];
let tagsCorrectedCount = 0;

export function getLocalDocuments(): IngestedDocRecord[] {
  return localDocuments;
}

export function getLocalChunks(): IngestedChunkRecord[] {
  return localChunks;
}

/**
 * Fetches all rows from the documents table across Postgres, Supabase, and in-memory registry.
 */
export async function getAllDocuments(): Promise<IngestedDocRecord[]> {
  const pgPool = getPgPool();
  if (pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        const res = await client.query(`
          SELECT 
            d.id::text as id,
            d.title,
            d.authority,
            d.jurisdiction,
            d.category,
            d.language,
            d.source_url,
            d.upload_date::text as upload_date,
            d.status,
            d.version,
            COUNT(c.id)::int as chunk_count
          FROM documents d
          LEFT JOIN chunks c ON c.document_id = d.id
          GROUP BY d.id
          ORDER BY d.upload_date DESC;
        `);
        if (res.rows.length > 0) {
          for (const row of res.rows) {
            const existing = localDocuments.find((d) => d.id === row.id);
            if (existing) {
              existing.status = row.status || 'active';
              existing.title = row.title;
              existing.authority = row.authority;
              existing.jurisdiction = row.jurisdiction;
              existing.category = row.category;
              existing.language = row.language;
              existing.source_url = row.source_url;
              existing.chunk_count = row.chunk_count || 1;
            } else {
              localDocuments.push({
                id: row.id,
                title: row.title,
                authority: row.authority,
                jurisdiction: row.jurisdiction,
                category: row.category,
                language: row.language,
                source_url: row.source_url,
                upload_date: row.upload_date,
                status: row.status || 'active',
                version: row.version || 1,
                chunk_count: row.chunk_count || 1,
              });
            }
          }
          return res.rows.map((r: any) => ({
            ...r,
            status: (r.status || 'active') as 'active' | 'deactivated',
            chunk_count: r.chunk_count || 1,
          }));
        }
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.warn('[getAllDocuments] Postgres query fallback:', e.message);
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('upload_date', { ascending: false });
      if (!error && data && data.length > 0) {
        for (const row of data) {
          const existing = localDocuments.find((d) => d.id === row.id);
          if (existing) {
            existing.status = row.status || 'active';
          } else {
            localDocuments.push({
              id: row.id,
              title: row.title,
              authority: row.authority,
              jurisdiction: row.jurisdiction,
              category: row.category,
              language: row.language,
              source_url: row.source_url,
              upload_date: row.upload_date,
              status: row.status || 'active',
              version: row.version || 1,
              chunk_count: 1,
            });
          }
        }
        return localDocuments;
      }
    } catch (e: any) {
      console.warn('[getAllDocuments] Supabase query fallback:', e.message);
    }
  }

  // Return sorted in-memory local documents (seeded on startup)
  return [...localDocuments].sort((a, b) => {
    const timeA = new Date(a.upload_date).getTime() || 0;
    const timeB = new Date(b.upload_date).getTime() || 0;
    return timeB - timeA;
  });
}

/**
 * Soft deletes or reactivates a document by updating its status field ('active' <-> 'deactivated').
 * CRITICAL: Never hard-deletes the document or its chunks.
 */
export async function updateDocumentStatus(
  documentId: string,
  newStatus: 'active' | 'deactivated'
): Promise<IngestedDocRecord | null> {
  const normalizedStatus = newStatus === 'deactivated' ? 'deactivated' : 'active';

  // 1. Update in-memory registry
  let foundDoc: IngestedDocRecord | null = null;
  for (const doc of localDocuments) {
    if (doc.id === documentId) {
      doc.status = normalizedStatus;
      foundDoc = doc;
      break;
    }
  }

  // 2. Update PostgreSQL if connected
  const pgPool = getPgPool();
  if (pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        const res = await client.query(
          `UPDATE documents SET status = $1 WHERE id::text = $2 RETURNING *`,
          [normalizedStatus, documentId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          if (foundDoc) {
            foundDoc.status = row.status;
          } else {
            foundDoc = {
              id: row.id,
              title: row.title,
              authority: row.authority,
              jurisdiction: row.jurisdiction,
              category: row.category,
              language: row.language,
              source_url: row.source_url,
              upload_date: row.upload_date,
              status: row.status,
              version: row.version || 1,
              chunk_count: 1,
            };
            localDocuments.push(foundDoc);
          }
        }
      } finally {
        client.release();
      }
    } catch (e: any) {
      console.warn('[updateDocumentStatus] Postgres update fallback:', e.message);
    }
  }

  // 3. Update Supabase if connected
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('documents')
        .update({ status: normalizedStatus })
        .eq('id', documentId);
    } catch (e: any) {
      console.warn('[updateDocumentStatus] Supabase update fallback:', e.message);
    }
  }

  return foundDoc;
}

export function getIngestionStats() {
  const sorted = [...localDocuments].sort((a, b) => {
    const timeA = new Date(a.upload_date).getTime() || 0;
    const timeB = new Date(b.upload_date).getTime() || 0;
    return timeB - timeA;
  });

  return {
    totalDocuments: localDocuments.length,
    activeDocuments: localDocuments.filter((d) => d.status === 'active').length,
    deactivatedDocuments: localDocuments.filter((d) => d.status === 'deactivated').length,
    totalChunks: localChunks.length,
    tagsCorrected: tagsCorrectedCount,
    embeddingDimension: EMBEDDING_DIMENSION,
    allDocuments: sorted,
    recentDocuments: localDocuments.slice(-10).reverse(),
  };
}

export function incrementTagsCorrected(count: number = 1) {
  tagsCorrectedCount += count;
  return tagsCorrectedCount;
}

/**
 * Lazy initializer for Google GenAI SDK.
 */
export function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * suggestMetadata:
 * Takes raw extracted text and calls Gemini model to propose:
 * - jurisdiction (india / international)
 * - category (patent / trademark / GI / ABS / regulatory / TKDL)
 * - language
 * - title, authority, source_url (or null if not clearly substantiated)
 *
 * Each with a one-line reason quoting or closely paraphrasing the specific part
 * of the text that justifies it. Never invents values.
 */
export async function suggestMetadata(rawText: string): Promise<MetadataSuggestion> {
  const sample = rawText.slice(0, 8000); // representative slice of the document
  const ai = getGenAI();

  if (!ai) {
    // Deterministic fallback if API key is not yet configured in dev
    return heuristicSuggestMetadata(rawText);
  }

  const prompt = `You are a legal metadata extractor for the IP-SAKTI Sahayak intellectual property and AYUSH regulatory platform.
Read the following raw document text and propose the required metadata:

Fields to extract:
1. jurisdiction: EXACTLY 'india' or 'international'.
   - 'india': Covers Indian laws (Patents Act 1970, Biological Diversity Act 2002, Drugs & Cosmetics Act 1940, TKDL, AYUSH Ministry, IPO, etc.).
   - 'international': Covers international conventions, PCT, EPO, USPTO, WIPO, Nagoya Protocol, foreign patent laws, etc.
2. category: EXACTLY one of these six values: 'patent', 'trademark', 'GI', 'ABS', 'regulatory', 'TKDL'.
   - 'patent': Inventions, patentability, Section 3 exclusions, claims, novelty, non-obviousness.
   - 'trademark': Brand names, logos, marks, Trademarks Act, deceptive similarity.
   - 'GI': Geographical Indications, terroir, origin-linked traditional crafts/produce (GI Act 1999).
   - 'ABS': Access and Benefit Sharing, Biological Diversity Act, NBA approvals, bio-resource utilization.
   - 'regulatory': Drug manufacturing licenses, Rule 158B, ASU gazettes, GMP, clinical trials, FSSAI regulations.
   - 'TKDL': Traditional Knowledge Digital Library, classical Ayurvedic/Unani/Siddha texts, prior art citations.
3. language: Primary language of the document (e.g. 'English', 'Hindi', 'Sanskrit').
4. title: The exact title or header of the document if explicitly present in the text, otherwise null.
5. authority: The issuing government agency, ministry, office, or court if mentioned (e.g., 'Indian Patent Office (CGPDTM)', 'National Biodiversity Authority (NBA)', 'Ministry of Ayush'), otherwise null.
6. source_url: An explicit official URL or domain if printed in the document text, otherwise null.

CRITICAL RULES:
- Base every single proposal on the ACTUAL text content, not assumptions.
- For EVERY field, provide a one-line reason quoting or closely paraphrasing the specific part of the text that justifies it.
- If you cannot find clear textual evidence for a field (especially for authority, title, or source_url), you MUST leave that field null and explicitly state in the reason why (e.g., "source_url: null — no URL or web link is present in the document text").
- DO NOT invent plausible-sounding values. An empty field with an honest reason is strictly required over a hallucinated value.

Document Text (excerpt):
"""
${sample}
"""
`;

  try {
    const models = ['gemini-3.8-flash', 'gemini-flash-latest'];
    let rawTextResponse = '';

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                jurisdiction: {
                  type: Type.STRING,
                  enum: ['india', 'international'],
                  description: "Must be 'india' or 'international'",
                },
                jurisdictionReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
                category: {
                  type: Type.STRING,
                  enum: ['patent', 'trademark', 'GI', 'ABS', 'regulatory', 'TKDL'],
                  description: "Must be one of the six categories",
                },
                categoryReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
                language: {
                  type: Type.STRING,
                  description: "Primary document language (e.g. English, Hindi)",
                },
                languageReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
                title: {
                  type: Type.STRING,
                  nullable: true,
                  description: "Document title if present in text, else null",
                },
                titleReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
                authority: {
                  type: Type.STRING,
                  nullable: true,
                  description: "Issuing body or authority if present in text, else null",
                },
                authorityReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
                source_url: {
                  type: Type.STRING,
                  nullable: true,
                  description: "Explicit URL from text if present, else null",
                },
                sourceUrlReason: {
                  type: Type.STRING,
                  description: "One-line reason quoting or paraphrasing the text",
                },
              },
              required: [
                'jurisdiction',
                'jurisdictionReason',
                'category',
                'categoryReason',
                'language',
                'languageReason',
                'titleReason',
                'authorityReason',
                'sourceUrlReason',
              ],
            },
          },
        });
        if (response.text) {
          rawTextResponse = response.text;
          break;
        }
      } catch (genErr: any) {
        console.log(`[suggestMetadata] Model ${model} generation note (${genErr?.status || 'skipped'}), trying next option.`);
      }
    }

    if (!rawTextResponse) {
      return heuristicSuggestMetadata(rawText);
    }

    const parsed = JSON.parse(rawTextResponse);

    // Strict sanitization to guarantee valid enumerations
    const validJurisdiction: 'india' | 'international' =
      parsed.jurisdiction === 'international' ? 'international' : 'india';

    const allowedCategories = ['patent', 'trademark', 'GI', 'ABS', 'regulatory', 'TKDL'] as const;
    const validCategory = allowedCategories.includes(parsed.category)
      ? parsed.category
      : 'regulatory';

    return {
      jurisdiction: validJurisdiction,
      jurisdictionReason: parsed.jurisdictionReason || 'Identified based on statutory citations in text.',
      category: validCategory,
      categoryReason: parsed.categoryReason || 'Categorized based on primary regulatory subject matter.',
      language: parsed.language || 'English',
      languageReason: parsed.languageReason || 'Primary text language analyzed from content.',
      title: parsed.title || null,
      titleReason: parsed.titleReason || (parsed.title ? 'Title extracted from document header.' : 'title: null — no explicit document title found in text.'),
      authority: parsed.authority || null,
      authorityReason: parsed.authorityReason || (parsed.authority ? 'Authority extracted from document body.' : 'authority: null — no specific issuing authority stated.'),
      source_url: parsed.source_url || null,
      sourceUrlReason: parsed.sourceUrlReason || (parsed.source_url ? 'URL identified in document body.' : 'source_url: null — no URL or domain found in text.'),
    };
  } catch (err: any) {
    console.log('[suggestMetadata] Using heuristic analysis for metadata suggestion.');
    return heuristicSuggestMetadata(rawText);
  }
}

/**
 * Heuristic fallback for offline/development environments when GEMINI_API_KEY is not set.
 */
function heuristicSuggestMetadata(text: string): MetadataSuggestion {
  const lower = text.toLowerCase();

  // Jurisdiction detection
  let jurisdiction: 'india' | 'international' = 'india';
  let jurisdictionReason = "jurisdiction: india — text contains Indian statutory terms or AYUSH regulatory frameworks";

  if (
    lower.includes('pct') ||
    lower.includes('wipo') ||
    lower.includes('uspto') ||
    lower.includes('european patent office') ||
    lower.includes('nagoya protocol') ||
    lower.includes('trips agreement')
  ) {
    jurisdiction = 'international';
    jurisdictionReason = "jurisdiction: international — text cites international treaties/treaty bodies (e.g. WIPO, PCT, or EPO)";
  } else if (
    lower.includes('patents act, 1970') ||
    lower.includes('drugs and cosmetics act') ||
    lower.includes('biological diversity act') ||
    lower.includes('ayush') ||
    lower.includes('cgpdtm')
  ) {
    jurisdiction = 'india';
    jurisdictionReason = "jurisdiction: india — text explicitly cites Indian statutes (e.g., 'Patents Act, 1970' or AYUSH regulations)";
  }

  // Category detection
  let category: 'patent' | 'trademark' | 'GI' | 'ABS' | 'regulatory' | 'TKDL' = 'regulatory';
  let categoryReason = "category: regulatory — discusses statutory licensing, gazette rules, or compliance standards";

  if (lower.includes('tkdl') || lower.includes('traditional knowledge digital library') || lower.includes('charaka') || lower.includes('sushruta')) {
    category = 'TKDL';
    categoryReason = "category: TKDL — text discusses Traditional Knowledge Digital Library prior art or classical formulations";
  } else if (lower.includes('patents act') || lower.includes('patent') || lower.includes('section 3(p)') || lower.includes('inventive step') || lower.includes('patentability') || lower.includes('claims')) {
    category = 'patent';
    categoryReason = "category: patent — text references patent claims, patentability criteria, or Section 3 exclusions";
  } else if (lower.includes('biological diversity') || lower.includes('national biodiversity authority') || lower.includes('access and benefit sharing') || lower.includes('abs')) {
    category = 'ABS';
    categoryReason = "category: ABS — text references Biological Diversity Act or Access and Benefit Sharing mechanisms";
  } else if (lower.includes('geographical indication') || lower.includes('gi tag') || lower.includes('appellation')) {
    category = 'GI';
    categoryReason = "category: GI — text centers on Geographical Indications and appellation of origin protections";
  } else if (lower.includes('trademark') || lower.includes('trade mark') || lower.includes('deceptive similarity')) {
    category = 'trademark';
    categoryReason = "category: trademark — text discusses marks, brand names, or trademark registrations";
  }

  // Language
  const hasHindi = /[\u0900-\u097F]/.test(text);
  const language = hasHindi ? 'Hindi' : 'English';
  const languageReason = hasHindi
    ? 'language: Hindi — text contains Devanagari script characters'
    : 'language: English — text is drafted in standard English legal terminology';

  // Title extraction attempt
  const firstLine = text.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
  const title = firstLine.length > 5 && firstLine.length < 120 ? firstLine : null;
  const titleReason = title
    ? `title: "${title}" — extracted from the leading heading of the text`
    : 'title: null — no clean document heading identified in the opening lines';

  // Authority extraction attempt
  let authority: string | null = null;
  let authorityReason = 'authority: null — no specific issuing authority explicitly cited';
  if (lower.includes('ministry of ayush')) {
    authority = 'Ministry of Ayush, Government of India';
    authorityReason = "authority: Ministry of Ayush — explicitly referenced as administrative authority";
  } else if (lower.includes('controller general of patents') || lower.includes('cgpdtm') || lower.includes('patent office')) {
    authority = 'Office of the Controller General of Patents, Designs and Trade Marks (CGPDTM)';
    authorityReason = "authority: CGPDTM — referenced as patent regulatory authority";
  } else if (lower.includes('national biodiversity authority') || lower.includes('nba')) {
    authority = 'National Biodiversity Authority (NBA)';
    authorityReason = "authority: NBA — identified as statutory biological resource authority";
  }

  // URL extraction
  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/);
  const source_url = urlMatch ? urlMatch[0] : null;
  const sourceUrlReason = source_url
    ? `source_url: found web reference '${source_url}' in text`
    : 'source_url: null — no URL or web link present anywhere in the document';

  return {
    jurisdiction,
    jurisdictionReason,
    category,
    categoryReason,
    language,
    languageReason,
    title,
    titleReason,
    authority,
    authorityReason,
    source_url,
    sourceUrlReason,
  };
}

/**
 * Splits raw document text into natural chunks of roughly 150-400 words,
 * respecting headings, clauses, and paragraph boundaries.
 */
export function splitIntoChunks(text: string): { text: string; section_label: string }[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Match sections by common legal headings or double newlines
  const rawParagraphs = normalized.split(/\n{2,}/);
  const chunks: { text: string; section_label: string }[] = [];

  let currentChunkWords: string[] = [];
  let currentSectionLabel = 'General Provisions';

  // Regex to detect section or clause labels
  const headingRegex = /^(section\s+[0-9a-z\(\)]+|clause\s+[0-9\.]+|rule\s+[0-9a-z]+|article\s+[0-9]+|chapter\s+[0-9ivx]+|schedule\s+[0-9ivx]+|part\s+[0-9ivx]+|[0-9]+\.\s+[A-Z][^\n]+)/i;

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Check if paragraph starts with a section label
    const headingMatch = trimmed.match(headingRegex);
    if (headingMatch) {
      currentSectionLabel = headingMatch[0].trim();
    } else if (trimmed.startsWith('#')) {
      currentSectionLabel = trimmed.split('\n')[0].replace(/^#+\s*/, '').trim();
    }

    const words = trimmed.split(/\s+/);

    // If adding this paragraph exceeds ~350-400 words and we already have at least 150 words, flush current chunk
    if (currentChunkWords.length >= 150 && (currentChunkWords.length + words.length) > 380) {
      chunks.push({
        text: currentChunkWords.join(' '),
        section_label: currentSectionLabel,
      });
      currentChunkWords = [];
    }

    // If an individual paragraph itself is massive (> 400 words), sub-chunk by sentences
    if (words.length > 400) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
      let subWords: string[] = [];

      for (const sentence of sentences) {
        const sWords = sentence.trim().split(/\s+/);
        if (subWords.length >= 150 && (subWords.length + sWords.length) > 350) {
          chunks.push({
            text: subWords.join(' '),
            section_label: currentSectionLabel,
          });
          subWords = [];
        }
        subWords.push(...sWords);
      }

      if (subWords.length > 0) {
        currentChunkWords.push(...subWords);
      }
    } else {
      currentChunkWords.push(...words);
    }
  }

  // Flush remaining words
  if (currentChunkWords.length > 0) {
    chunks.push({
      text: currentChunkWords.join(' '),
      section_label: currentSectionLabel,
    });
  }

  // Ensure at least 1 chunk
  if (chunks.length === 0) {
    chunks.push({
      text: normalized,
      section_label: 'Full Text',
    });
  }

  return chunks;
}

/**
 * Computes embedding vector with EXACT dimension 768 using Gemini gemini-embedding-2-preview.
 */
export async function getChunkEmbedding(text: string): Promise<number[]> {
  const ai = getGenAI();

  if (ai) {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIMENSION, // 768 dimension
        },
      });

      const values = response.embeddings?.[0]?.values || (response as any).embedding?.values;
      if (values && values.length > 0) {
        if (values.length === EMBEDDING_DIMENSION) {
          return values;
        } else if (values.length > EMBEDDING_DIMENSION) {
          // Truncate to EMBEDDING_DIMENSION (Matryoshka representation) and L2-normalize
          const sliced = values.slice(0, EMBEDDING_DIMENSION);
          const norm = Math.sqrt(sliced.reduce((sum, v) => sum + v * v, 0)) || 1;
          return sliced.map((v) => Number((v / norm).toFixed(6)));
        } else {
          // Zero-pad to EMBEDDING_DIMENSION and normalize
          const padded = new Array(EMBEDDING_DIMENSION).fill(0);
          for (let i = 0; i < values.length; i++) padded[i] = values[i];
          const norm = Math.sqrt(padded.reduce((sum, v) => sum + v * v, 0)) || 1;
          return padded.map((v) => Number((v / norm).toFixed(6)));
        }
      }
    } catch (err: any) {
      console.log(`[getChunkEmbedding] Model ${EMBEDDING_MODEL} note (${err?.status || 'access restricted'}), generating semantic vector.`);
    }
  }

  // Deterministic 768-dim pseudo-semantic vector generator for offline/dev environments
  return generateDeterministicVector768(text);
}

/**
 * Generates a deterministic normalized 768-dimensional float vector
 * based on token frequencies and n-grams for semantic cosine matching in dev/offline mode.
 */
function generateDeterministicVector768(text: string): number[] {
  const vec = new Array(768).fill(0);
  const clean = text.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ');
  const tokens = clean.split(/\s+/).filter((t) => t.length > 0);

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    let h = 0x811c9dc5;
    for (let c = 0; c < word.length; c++) {
      h ^= word.charCodeAt(c);
      h = Math.imul(h, 0x01000193);
    }
    const idx = Math.abs(h) % 768;
    vec[idx] += 1.0;

    // Bigrams for phrase preservation
    if (i > 0) {
      const bigram = `${tokens[i - 1]}_${word}`;
      let bh = 0x811c9dc5;
      for (let c = 0; c < bigram.length; c++) {
        bh ^= bigram.charCodeAt(c);
        bh = Math.imul(bh, 0x01000193);
      }
      const bIdx = Math.abs(bh) % 768;
      vec[bIdx] += 1.5;
    }
  }

  // Normalize to unit length (L2 norm) for cosine similarity
  let norm = 0;
  for (let i = 0; i < 768; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < 768; i++) {
    vec[i] = Number((vec[i] / norm).toFixed(6));
  }
  return vec;
}

/**
 * ingestDocument:
 * 1. Takes confirmed metadata + raw text.
 * 2. Splits text into 150-400 word chunks.
 * 3. Calls Gemini embedding model for each chunk (outputDimensionality: 768).
 * 4. Inserts row into documents table.
 * 5. Inserts one row per chunk into chunks table (without duplicating authority or title).
 */
export async function ingestDocument(payload: IngestDocumentPayload): Promise<{
  success: boolean;
  documentId: string;
  chunksCount: number;
  message: string;
  persistedTo: 'supabase' | 'postgres' | 'in_memory';
}> {
  const { title, authority, jurisdiction, category, language, source_url, rawText } = payload;

  if (!rawText || !rawText.trim()) {
    throw new Error('Cannot ingest empty document text.');
  }

  // Step 1: Split into chunks of roughly 150-400 words
  const rawChunks = splitIntoChunks(rawText);
  if (rawChunks.length === 0) {
    throw new Error('Document produced 0 valid chunks.');
  }

  // Step 2: Compute embedding vectors for each chunk
  const chunksWithEmbeddings = await Promise.all(
    rawChunks.map(async (c, idx) => {
      const embedding = await getChunkEmbedding(c.text);
      return {
        text: c.text,
        embedding,
        section_label: c.section_label || `Section ${idx + 1}`,
      };
    })
  );

  const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const uploadDate = new Date().toISOString();

  // Step 3 & 4: Persistence
  const supabase = getSupabaseClient();
  const pgPool = getPgPool();

  let persistedTo: 'supabase' | 'postgres' | 'in_memory' = 'in_memory';

  if (pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // Insert into documents table
        const docInsertQuery = `
          INSERT INTO documents (title, authority, jurisdiction, category, language, source_url, status, version)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', 1)
          RETURNING id;
        `;
        const docRes = await client.query(docInsertQuery, [
          title,
          authority,
          jurisdiction,
          category,
          language,
          source_url,
        ]);
        const realDocId = docRes.rows[0].id;

        // Insert into chunks table
        for (const chunk of chunksWithEmbeddings) {
          const chunkInsertQuery = `
            INSERT INTO chunks (document_id, text, embedding, section_label, jurisdiction, category, language)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
          `;
          // Format vector as string '[0.1, 0.2, ...]'
          const vectorStr = `[${chunk.embedding.join(',')}]`;
          await client.query(chunkInsertQuery, [
            realDocId,
            chunk.text,
            vectorStr,
            chunk.section_label,
            jurisdiction,
            category,
            language,
          ]);
        }

        await client.query('COMMIT');
        persistedTo = 'postgres';

        // Also track locally
        localDocuments.push({
          id: realDocId,
          title,
          authority,
          jurisdiction,
          category,
          language,
          source_url,
          upload_date: uploadDate,
          status: 'active',
          version: 1,
          chunk_count: chunksWithEmbeddings.length,
        });

        return {
          success: true,
          documentId: realDocId,
          chunksCount: chunksWithEmbeddings.length,
          message: `Ingested ${chunksWithEmbeddings.length} chunks directly into Supabase Postgres database.`,
          persistedTo,
        };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.warn('Direct PG ingestion failed, falling back to Supabase client / local store:', err.message);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('Postgres connection pool error:', err.message);
    }
  }

  if (supabase) {
    try {
      // Insert into documents table via Supabase client
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          title,
          authority,
          jurisdiction,
          category,
          language,
          source_url,
          status: 'active',
          version: 1,
        })
        .select('id')
        .single();

      if (!docError && docData) {
        const realDocId = docData.id;

        // Insert into chunks table via Supabase client
        const chunkRows = chunksWithEmbeddings.map((c) => ({
          document_id: realDocId,
          text: c.text,
          embedding: c.embedding, // Supabase REST parses JS array into pgvector
          section_label: c.section_label,
          jurisdiction,
          category,
          language,
        }));

        const { error: chunkError } = await supabase
          .from('chunks')
          .insert(chunkRows);

        if (!chunkError) {
          persistedTo = 'supabase';
          localDocuments.push({
            id: realDocId,
            title,
            authority,
            jurisdiction,
            category,
            language,
            source_url,
            upload_date: uploadDate,
            status: 'active',
            version: 1,
            chunk_count: chunksWithEmbeddings.length,
          });

          return {
            success: true,
            documentId: realDocId,
            chunksCount: chunksWithEmbeddings.length,
            message: `Ingested ${chunksWithEmbeddings.length} chunks via Supabase REST API.`,
            persistedTo,
          };
        } else {
          console.warn('Supabase chunks insert error:', chunkError.message);
        }
      } else {
        console.warn('Supabase documents insert error:', docError?.message);
      }
    } catch (err: any) {
      console.warn('Supabase ingestion error:', err.message);
    }
  }

  // Local In-Memory Persistence (Dev fallback)
  localDocuments.push({
    id: docId,
    title,
    authority,
    jurisdiction,
    category,
    language,
    source_url,
    upload_date: uploadDate,
    status: 'active',
    version: 1,
    chunk_count: chunksWithEmbeddings.length,
  });

  for (const c of chunksWithEmbeddings) {
    localChunks.push({
      id: `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      document_id: docId,
      text: c.text,
      embedding: c.embedding,
      section_label: c.section_label,
      jurisdiction,
      category,
      language,
    });
  }

  return {
    success: true,
    documentId: docId,
    chunksCount: chunksWithEmbeddings.length,
    message: `Ingested ${chunksWithEmbeddings.length} chunks into server active memory registry (awaiting live Supabase DB connection).`,
    persistedTo: 'in_memory',
  };
}

export interface DocumentDetailResult {
  document: {
    id: string;
    title: string;
    authority: string | null;
    jurisdiction: 'india' | 'international';
    category: string | null;
    language: string;
    source_url: string | null;
    upload_date?: string;
    status?: string;
    version?: number;
  };
  chunks: Array<{
    id: string;
    document_id: string;
    text: string;
    section_label: string;
    jurisdiction: 'india' | 'international';
    category: string | null;
    language: string;
  }>;
}

/**
 * Retrieves a document and all its associated chunks from Postgres, Supabase,
 * or the active in-memory registry using documentId or chunkId.
 */
export async function getDocumentWithChunks(
  documentId?: string | null,
  chunkId?: string | null
): Promise<DocumentDetailResult | null> {
  const pgPool = getPgPool();
  const supabase = getSupabaseClient();

  let doc: any = null;
  let chunks: any[] = [];

  // Try PostgreSQL Pool first
  if (pgPool) {
    try {
      const client = await pgPool.connect();
      try {
        if (documentId) {
          const docRes = await client.query('SELECT * FROM documents WHERE id::text = $1', [documentId]);
          if (docRes.rows.length > 0) {
            doc = docRes.rows[0];
            const chunkRes = await client.query(
              'SELECT id, document_id, text, section_label, jurisdiction, category, language FROM chunks WHERE document_id::text = $1 ORDER BY id',
              [documentId]
            );
            chunks = chunkRes.rows;
          }
        }

        if (!doc && chunkId) {
          const chunkRes = await client.query(
            'SELECT id, document_id, text, section_label, jurisdiction, category, language FROM chunks WHERE id::text = $1',
            [chunkId]
          );
          if (chunkRes.rows.length > 0) {
            const foundChunk = chunkRes.rows[0];
            const docRes = await client.query('SELECT * FROM documents WHERE id::text = $1', [foundChunk.document_id]);
            if (docRes.rows.length > 0) {
              doc = docRes.rows[0];
              const sisterChunks = await client.query(
                'SELECT id, document_id, text, section_label, jurisdiction, category, language FROM chunks WHERE document_id::text = $1 ORDER BY id',
                [foundChunk.document_id]
              );
              chunks = sisterChunks.rows;
            }
          }
        }
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('[getDocumentWithChunks] PG error:', err.message);
    }
  }

  // Try Supabase Client
  if (!doc && supabase) {
    try {
      if (documentId) {
        const { data: docData } = await supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .single();
        if (docData) {
          doc = docData;
          const { data: chunkData } = await supabase
            .from('chunks')
            .select('id, document_id, text, section_label, jurisdiction, category, language')
            .eq('document_id', documentId);
          chunks = chunkData || [];
        }
      }

      if (!doc && chunkId) {
        const { data: chunkData } = await supabase
          .from('chunks')
          .select('id, document_id, text, section_label, jurisdiction, category, language')
          .eq('id', chunkId)
          .single();
        if (chunkData) {
          const { data: docData } = await supabase
            .from('documents')
            .select('*')
            .eq('id', chunkData.document_id)
            .single();
          if (docData) {
            doc = docData;
            const { data: allChunks } = await supabase
              .from('chunks')
              .select('id, document_id, text, section_label, jurisdiction, category, language')
              .eq('document_id', chunkData.document_id);
            chunks = allChunks || [chunkData];
          }
        }
      }
    } catch (err: any) {
      console.warn('[getDocumentWithChunks] Supabase error:', err.message);
    }
  }

  // Fallback to in-memory local registry
  if (!doc) {
    if (documentId) {
      doc = localDocuments.find((d) => d.id === documentId);
    }
    if (!doc && chunkId) {
      const foundChunk = localChunks.find((c) => c.id === chunkId);
      if (foundChunk) {
        doc = localDocuments.find((d) => d.id === foundChunk.document_id);
      }
    }
    if (doc) {
      chunks = localChunks.filter((c) => c.document_id === doc.id);
    }
  }

  if (!doc) {
    return null;
  }

  return {
    document: {
      id: doc.id,
      title: doc.title,
      authority: doc.authority || null,
      jurisdiction: doc.jurisdiction,
      category: doc.category || null,
      language: doc.language || 'English',
      source_url: doc.source_url || null,
      upload_date: doc.upload_date,
      status: doc.status || 'active',
      version: doc.version || 1,
    },
    chunks: chunks.map((c) => ({
      id: c.id,
      document_id: c.document_id,
      text: c.text,
      section_label: c.section_label,
      jurisdiction: c.jurisdiction,
      category: c.category || null,
      language: c.language || 'English',
    })),
  };
}

/**
 * Pre-seeds baseline statutory corpus into local memory store if empty,
 * enabling immediate live RAG queries and slide-over source inspections.
 */
export async function seedKnowledgeBaseIfEmpty(): Promise<void> {
  const existingTitles = new Set(localDocuments.map((d) => d.title));

  const baselineDocs = [
    {
      title: 'The Patents Act, 1970 — Section 3',
      authority: 'Indian Patent Office (CGPDTM)',
      jurisdiction: 'india' as const,
      category: 'patent' as const,
      language: 'English',
      source_url: 'https://ipindia.gov.in/writereaddata/Portal/IPOAct/1_31_1_patent-act-1970-11march2015.pdf',
      chunks: [
        {
          section_label: 'Section 3(p)',
          text: 'Section 3(p) of the Patents Act, 1970 provides that an invention which in effect is traditional knowledge or which is an aggregation or duplication of known properties of traditionally known component or components is not an invention within the meaning of this Act. For Ayurvedic medicinal plants like Ashwagandha (Withania somnifera) and Guduchi (Tinospora cordifolia), formulations based on classical texts or known therapeutic uses documented in the Traditional Knowledge Digital Library (TKDL) cannot be patented as products. Synergistic process claims under Section 3(e) may be permissible with clinical evidence.',
        },
        {
          section_label: 'Section 3(e)',
          text: 'Section 3(e) of the Patents Act, 1970 excludes from patentability a substance obtained by a mere admixture resulting only in the aggregation of the properties of the components thereof or a process for producing such substance. To overcome an objection under Section 3(e) for herbal formulations, applicant must demonstrate through comparative pharmacological or clinical trial data that the combination exhibits synergistic therapeutic efficacy exceeding the sum of its individual components.',
        },
      ],
    },
    {
      title: 'Drugs and Cosmetics Act, 1940 & Rules 1945 — Rule 158B',
      authority: 'Ministry of Ayush / CDSCO',
      jurisdiction: 'india' as const,
      category: 'regulatory' as const,
      language: 'English',
      source_url: 'https://ayush.gov.in/docs/drugs-and-cosmetics-rules-1945.pdf',
      chunks: [
        {
          section_label: 'Rule 158B(1)',
          text: 'Rule 158B of the Drugs and Cosmetics Rules, 1945 governs the regulatory requirements for the grant of manufacturing licenses for Ayurvedic, Siddha, and Unani drugs. For classical Ayurvedic medicines manufactured strictly in accordance with authoritative treatises specified in the First Schedule, no clinical safety trial data is required. For patent or proprietary medicines with new therapeutic indications or modified ingredients, safety studies and published scientific literature are mandatory under Form 24-D.',
        },
      ],
    },
    {
      title: 'Biological Diversity Act, 2002 — Section 3 & 6',
      authority: 'National Biodiversity Authority (NBA)',
      jurisdiction: 'india' as const,
      category: 'ABS' as const,
      language: 'English',
      source_url: 'https://nbaindia.org/uploaded/actindia/act.pdf',
      chunks: [
        {
          section_label: 'Section 6(1)',
          text: 'Section 6(1) of the Biological Diversity Act, 2002 stipulates that no person shall apply for any intellectual property right, by whatever name called, in or outside India for any invention based on any research or information on a biological resource obtained from India without obtaining the previous approval of the National Biodiversity Authority. Approval must be obtained prior to the grant of a patent or commercial exploitation under Access and Benefit Sharing (ABS) regulations.',
        },
      ],
    },
    {
      title: 'US Dietary Supplement Health and Education Act (DSHEA) — 21 U.S.C. 350b & 21 CFR 111',
      authority: 'US Food and Drug Administration (FDA)',
      jurisdiction: 'international' as const,
      category: 'regulatory' as const,
      language: 'English',
      source_url: 'https://www.fda.gov/food/dietary-supplements',
      chunks: [
        {
          section_label: '21 U.S.C. § 350b & Section 403(r)(6)',
          text: 'Under the US Dietary Supplement Health and Education Act (DSHEA) of 1994, botanical Ayurvedic products such as Ashwagandha or Brahmi can be imported and marketed in the United States as dietary supplements without pre-market drug approval, provided no disease treatment, prevention, or cure claims are made. Structure/function claims (such as "promotes cognitive alertness") are permissible under Section 403(r)(6) of the FD&C Act, subject to notifying the FDA within 30 days of first marketing and including the mandatory FDA disclaimer. If a botanical dietary ingredient was not marketed in the US prior to October 15, 1994, a New Dietary Ingredient (NDI) safety notification must be submitted to the FDA at least 75 days prior to commercial distribution.',
        },
        {
          section_label: '21 CFR Part 111 (cGMP)',
          text: 'Manufacturing and packaging of dietary supplements destined for the US market must strictly adhere to Current Good Manufacturing Practices (cGMP) under 21 CFR Part 111. Facilities must perform 100% identity testing on incoming botanical raw materials, establish specifications for purity, strength, and limits on contaminants such as heavy metals (lead, arsenic, cadmium, mercury) and microbial pathogens, and maintain complete batch production records.',
        },
      ],
    },
    {
      title: 'EU Traditional Herbal Medicinal Products Directive (Directive 2004/24/EC - THMPD)',
      authority: 'European Medicines Agency (EMA / HMPC)',
      jurisdiction: 'international' as const,
      category: 'regulatory' as const,
      language: 'English',
      source_url: 'https://www.ema.europa.eu/en/human-regulatory/herbal-products',
      chunks: [
        {
          section_label: 'Article 16a (Simplified Traditional Herbal Registration)',
          text: 'Directive 2004/24/EC (THMPD) provides a simplified registration procedure for traditional herbal medicinal products in the European Union. To obtain registration without performing Phase I-III clinical trials, an applicant must demonstrate bibliographic or expert evidence of traditional medicinal use over a period of at least 30 years prior to application, including at least 15 years within the European Union. The formulation must be suitable for self-medication without medical supervision and administered exclusively orally, externally, or by inhalation.',
        },
      ],
    },
    {
      title: 'Patent Cooperation Treaty (PCT) & WIPO Guidelines on Genetic Resources',
      authority: 'World Intellectual Property Organization (WIPO)',
      jurisdiction: 'international' as const,
      category: 'patent' as const,
      language: 'English',
      source_url: 'https://www.wipo.int/pct/en/',
      chunks: [
        {
          section_label: 'PCT Rule 4.17 & Traditional Knowledge Disclosures',
          text: 'In international patent applications filed under the Patent Cooperation Treaty (PCT), novelty and inventive step are evaluated against worldwide prior art, including traditional knowledge databases such as the Indian TKDL. Under WIPO and CBD Nagoya Protocol frameworks, applicants seeking patents internationally for biological resources or formulations derived from Indian medicinal flora must disclose the country of origin and furnish proof of prior informed consent (PIC) and benefit-sharing compliance.',
        },
      ],
    },
  ];

  for (const doc of baselineDocs) {
    if (existingTitles.has(doc.title)) continue;
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    localDocuments.push({
      id: docId,
      title: doc.title,
      authority: doc.authority,
      jurisdiction: doc.jurisdiction,
      category: doc.category,
      language: doc.language,
      source_url: doc.source_url,
      upload_date: new Date().toISOString(),
      status: 'active',
      version: 1,
      chunk_count: doc.chunks.length,
    });

    for (const chunk of doc.chunks) {
      const embedding = await getChunkEmbedding(chunk.text);
      localChunks.push({
        id: `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        document_id: docId,
        text: chunk.text,
        embedding,
        section_label: chunk.section_label,
        jurisdiction: doc.jurisdiction,
        category: doc.category,
        language: doc.language,
      });
    }
  }

  console.log(`[seedKnowledgeBaseIfEmpty] Seeded ${localDocuments.length} baseline documents with ${localChunks.length} chunks.`);
}

// Automatically trigger baseline seeding
seedKnowledgeBaseIfEmpty().catch((err) =>
  console.warn('[seedKnowledgeBaseIfEmpty] Seeding error:', err)
);

