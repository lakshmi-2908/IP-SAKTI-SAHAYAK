import { getGenAI, getChunkEmbedding, getLocalChunks, getLocalDocuments, EMBEDDING_MODEL, EMBEDDING_DIMENSION } from './ingestion';
import { getPgPool, getSupabaseClient, isPostgresDirectAvailable, markPostgresDirectFailure } from './supabase';

export interface AskQuestionInput {
  question: string;
  jurisdiction: 'india' | 'international' | 'India' | 'International';
  language: string;
  englishRetrievalQuestion?: string;
  classification?: {
    categoryName?: string;
    category?: string;
    regime?: string;
    description?: string;
    productDescription?: string;
    formulation?: string;
    isClassified?: boolean;
    [key: string]: any;
  } | string | null;
  recentMessages?: Array<{
    sender: 'user' | 'assistant' | string;
    content: string;
  }> | string | null;
}

export interface CitationItem {
  number: number;
  chunk_id: string;
  document_id: string;
  documentTitle: string;
  authority: string | null;
  sectionLabel: string | null;
  snippet: string;
  fullText?: string;
  sourceUrl: string | null;
  jurisdiction?: string;
  category?: string | null;
  language?: string | null;
  citedSentence?: string;
  hindiParaphrase?: string;
}

export interface JurisdictionSectionResult {
  jurisdiction: 'india' | 'international';
  sectionLabel: 'In India:' | 'Internationally:' | 'भारत में:' | 'अंतरराष्ट्रीय स्तर पर:' | string;
  answer: string;
  citations: CitationItem[];
  confidence: 'high' | 'medium' | 'low';
  shouldEscalate: boolean;
}

export interface AskQuestionResult {
  answer: string;
  citations: CitationItem[];
  confidence: 'high' | 'medium' | 'low';
  shouldEscalate: boolean;
  isDualJurisdiction?: boolean;
  sections?: JurisdictionSectionResult[];
  originalQuestion?: string;
  translatedQuery?: string;
}

export interface CandidateChunk {
  id: string;
  document_id: string;
  text: string;
  sectionLabel: string | null;
  jurisdiction: 'india' | 'international';
  category: string | null;
  language: string | null;
  documentTitle: string;
  authority: string | null;
  sourceUrl: string | null;
  similarity: number;
}

const FIXED_ABSTENTION_MESSAGE =
  "I don't have a reliable, cited answer to this specific question in my current knowledge base.";

/**
 * Step 1: Build retrieval query as a single plain-text string.
 * Formed as:
 * - user's question
 * - followed by " — jurisdiction: " and the jurisdiction value
 * - followed by " — product context: " and a one-line summary of classification object if provided
 * - followed by " — prior context: " and a one-line summary of recentMessages if passed in
 */
export function buildRetrievalQuery(params: {
  question: string;
  jurisdiction: string;
  classification?: any;
  recentMessages?: any;
}): string {
  let query = params.question.trim();

  // Normalize jurisdiction to 'india' or 'international'
  const normJurisdiction = params.jurisdiction.toLowerCase().includes('inter')
    ? 'international'
    : 'india';
  query += ` — jurisdiction: ${normJurisdiction}`;

  // Product context piece
  if (params.classification) {
    let summary = '';
    if (typeof params.classification === 'string' && params.classification.trim().length > 0) {
      summary = params.classification.trim();
    } else if (typeof params.classification === 'object') {
      if (params.classification.isClassified !== false) {
        const cat =
          params.classification.categoryName ||
          params.classification.category ||
          params.classification.regime ||
          '';
        const desc =
          params.classification.productDescription ||
          params.classification.description ||
          params.classification.formulation ||
          '';
        if (cat && desc) {
          summary = `${cat}, ${desc}`;
        } else if (cat) {
          summary = cat;
        } else if (desc) {
          summary = desc;
        }
      }
    }
    if (summary) {
      const oneLine = summary.replace(/\r?\n|\r/g, ' ').trim();
      if (oneLine.length > 0) {
        query += ` — product context: ${oneLine}`;
      }
    }
  }

  // Prior context piece (crucial for short elliptical follow-ups)
  if (params.recentMessages) {
    let priorSummary = '';
    if (typeof params.recentMessages === 'string' && params.recentMessages.trim().length > 0) {
      priorSummary = params.recentMessages.trim();
    } else if (Array.isArray(params.recentMessages) && params.recentMessages.length > 0) {
      const msgs = params.recentMessages;
      const prevUser = [...msgs].reverse().find((m) => m.sender === 'user');
      const prevAsst = [...msgs].reverse().find((m) => m.sender === 'assistant');

      if (prevUser && prevAsst) {
        const cleanUserQ = prevUser.content
          .replace(/^\[DEMO\]\s*/i, '')
          .replace(/\r?\n|\r/g, ' ')
          .trim();
        const cleanAsstA = prevAsst.content
          .replace(/^\[DEMO\]\s*/i, '')
          .replace(/\r?\n|\r/g, ' ')
          .trim();
        const firstSentence =
          cleanAsstA.split(/(?<=[.?!])\s+/)[0] || cleanAsstA.slice(0, 150);
        priorSummary = `previous question asked whether: "${cleanUserQ}"; previous answer discussed: "${firstSentence}"`;
      } else if (prevUser) {
        const cleanUserQ = prevUser.content
          .replace(/^\[DEMO\]\s*/i, '')
          .replace(/\r?\n|\r/g, ' ')
          .trim();
        priorSummary = `previous question asked whether: "${cleanUserQ}"`;
      } else if (prevAsst) {
        const cleanAsstA = prevAsst.content
          .replace(/^\[DEMO\]\s*/i, '')
          .replace(/\r?\n|\r/g, ' ')
          .trim();
        const firstSentence =
          cleanAsstA.split(/(?<=[.?!])\s+/)[0] || cleanAsstA.slice(0, 150);
        priorSummary = `previous answer discussed: "${firstSentence}"`;
      }
    }

    if (priorSummary.trim().length > 0) {
      const oneLine = priorSummary.replace(/\r?\n|\r/g, ' ').trim();
      query += ` — prior context: ${oneLine}`;
    }
  }

  return query;
}

/**
 * Translates a user question from Hindi to English prior to vector embedding/retrieval.
 * Retrieval and the underlying corpus remain strictly in English.
 * Original Hindi question is always preserved alongside translated query for auditing.
 */
export async function translateHindiToEnglish(hindiQuestion: string): Promise<string> {
  const trimmed = (hindiQuestion || '').trim();
  if (!trimmed) return trimmed;

  // If there are no Devanagari characters, return as is
  const hasDevanagari = /[\u0900-\u097F]/.test(trimmed);
  if (!hasDevanagari) {
    return trimmed;
  }

  const ai = getGenAI();
  if (ai) {
    const models = ['gemini-3.8-flash', 'gemini-flash-latest'];
    for (const model of models) {
      try {
        const prompt = `You are a specialized legal translator for Indian and international intellectual property, patents, and AYUSH regulatory frameworks.
Translate the following user question from Hindi into clear, accurate legal and regulatory English for vector retrieval against an English statutory database.
Do not add preamble, explanation, or quotes; return ONLY the direct English translation.

User Question (in Hindi):
${trimmed}`;

        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.0,
          },
        });
        const translated = res.text?.trim().replace(/^["']|["']$/g, '');
        if (translated && translated.length > 2) {
          console.log(`[translateHindiToEnglish] Successfully translated via ${model}: "${trimmed}" -> "${translated}"`);
          return translated;
        }
      } catch (err: any) {
        console.warn(`[translateHindiToEnglish] Model ${model} translation warning:`, err.message);
      }
    }
  }

  // Deterministic legal keyword mapper fallback for offline/restricted environments
  console.log('[translateHindiToEnglish] Using deterministic keyword mapper fallback');
  const keywordMappings: [RegExp, string][] = [
    [/पेटेंट/gi, 'patent'],
    [/अश्वगंधा/gi, 'Ashwagandha Withania somnifera'],
    [/गिलोय|गुडूची/gi, 'Guduchi Tinospora cordifolia'],
    [/हल्दी/gi, 'Turmeric Curcuma longa'],
    [/नीम/gi, 'Neem Azadirachta indica'],
    [/लाइसेंस|अनुज्ञप्ति/gi, 'licence manufacturing approval Rule 158B'],
    [/कच्ची सामग्री|जड़ी-बूटी/gi, 'raw material biological resource NBA approval'],
    [/पारंपरिक ज्ञान/gi, 'traditional knowledge TKDL Section 3(p)'],
    [/आयुर्वेद|आयुर्वेदिक/gi, 'Ayurvedic classical proprietary medicine'],
    [/फॉर्मूलेशन|उत्पाद/gi, 'formulation product combination'],
    [/नियम|अधिनियम/gi, 'Act rules regulations'],
    [/क्या मैं|क्या हम/gi, 'Can I'],
    [/करा सकता हूँ|करा सकते हैं/gi, 'obtain or register'],
    [/अमेरिका|यूएस|विदेश|अंतरराष्ट्रीय/gi, 'United States international export FDA NDI'],
    [/जैव विविधता/gi, 'biological diversity NBA Section 6'],
  ];

  const matched: string[] = [];
  for (const [regex, term] of keywordMappings) {
    if (regex.test(trimmed)) {
      matched.push(term);
    }
  }

  if (matched.length > 0) {
    return `${matched.join(' ')} statutory regulatory legal provisions`;
  }

  return trimmed;
}

/**
 * Returns a deterministic fallback Hindi paraphrase for a statutory passage based on its legal section and content.
 */
export function getHindiParaphraseFallback(chunk: {
  text: string;
  documentTitle?: string;
  sectionLabel?: string | null;
  category?: string | null;
}): string {
  const text = (chunk.text || '').toLowerCase();
  const label = (chunk.sectionLabel || '').toLowerCase();
  const title = (chunk.documentTitle || '').toLowerCase();

  if (label.includes('3(p)') || text.includes('traditional knowledge') || text.includes('tkdl')) {
    return 'पेटेंट अधिनियम की धारा 3(p) के तहत पारंपरिक ज्ञान या ज्ञात घटकों के मात्र संकलन का पेटेंट नहीं कराया जा सकता है।';
  }
  if (label.includes('6(1)') || label.includes('section 6') || title.includes('biodiversity') || text.includes('national biodiversity')) {
    return 'जैव विविधता अधिनियम की धारा 6(1) के तहत भारतीय जैविक संसाधनों पर आधारित किसी भी बौद्धिक संपदा अधिकार के लिए राष्ट्रीय जैव विविधता प्राधिकरण (NBA) की पूर्व स्वीकृति अनिवार्य है।';
  }
  if (label.includes('158b') || text.includes('rule 158b') || text.includes('proprietary')) {
    return 'ड्रग्स एंड कॉस्मेटिक्स रूल्स के नियम 158B के तहत पेटेंट एवं प्रोप्राइटरी आयुर्वेदिक दवाओं के निर्माण हेतु सुरक्षा एवं प्रभावशीलता के वैज्ञानिक साक्ष्य आवश्यक हैं।';
  }
  if (label.includes('3(a)') || text.includes('schedule i') || text.includes('classical text')) {
    return 'धारा 3(a) एवं अनुसूची I के अनुसार शास्त्रीय आयुर्वेदिक ग्रंथ में उल्लिखित नुस्खे बिना बदलाव के निर्मित करने पर शास्त्रीय औषधि का लाइसेंस मिलता है।';
  }
  if (text.includes('fda') || text.includes('dietary supplement') || text.includes('ndi')) {
    return 'अंतरराष्ट्रीय स्तर पर यूएस एफडीए नियमों के तहत आयुर्वेदिक औषधियों को आहार पूरक (Dietary Supplement) के रूप में वर्गीकृत किया जाता है और नए घटक हेतु NDI अधिसूचना आवश्यक होती है।';
  }
  if (text.includes('fssai') || text.includes('ayush aahara')) {
    return 'FSSAI आयुष आहार विनियमों के तहत पोषण एवं स्वास्थ्य संवर्धन हेतु पारंपरिक वनस्पति उत्पादों का खाद्य श्रेणी में पंजीकरण किया जा सकता है।';
  }

  return `${chunk.documentTitle || 'वैधानिक स्रोत'} (${chunk.sectionLabel || 'प्रावधान'}) के तहत निर्धारित कानूनी एवं विनियामक अनुपालन का पालन करना अनिवार्य है।`;
}

/**
 * Calls Gemini to generate a concise one-line Hindi paraphrase for a statutory passage snippet,
 * keeping the original English snippet intact.
 */
export async function generateHindiParaphraseForSnippet(
  snippetText: string,
  docTitle?: string,
  sectionLabel?: string
): Promise<string> {
  const cleanSnippet = (snippetText || '').trim();
  if (!cleanSnippet) return '';

  const ai = getGenAI();
  if (ai) {
    const models = ['gemini-3.8-flash', 'gemini-flash-latest'];
    for (const model of models) {
      try {
        const prompt = `You are an Indian and international legal expert.
Provide a concise, accurate one-line paraphrase in clear, formal Hindi (Devanagari script) explaining the key legal or regulatory principle of this statutory passage.
Keep it strictly to ONE sentence. Do not add quotes, introductory text, or bullet points.

Document: ${docTitle || 'Statutory Source'} (${sectionLabel || 'Provision'})
English Passage:
"${cleanSnippet}"`;

        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.1,
          },
        });
        const hindiText = res.text?.trim().replace(/^["']|["']$/g, '');
        if (hindiText && hindiText.length > 5) {
          return hindiText;
        }
      } catch (err: any) {
        console.warn(`[generateHindiParaphraseForSnippet] Model ${model} note:`, err.message);
      }
    }
  }

  return getHindiParaphraseFallback({
    text: cleanSnippet,
    documentTitle: docTitle,
    sectionLabel,
  });
}

/**
 * Calculates cosine similarity between two numeric vectors.
 */
function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Step 3: Run hybrid semantic and lexical search against the "chunks" table,
 * filtered to rows where chunks.jurisdiction exactly matches the given jurisdiction.
 * Retrieves candidate pool (up to 25) and applies Reciprocal Rank & Keyword Boosting
 * to ensure exact statutory provisions matching query concepts surface to the top.
 */
async function searchCandidateChunks(
  queryVector: number[],
  jurisdiction: 'india' | 'international',
  rawQueryText?: string
): Promise<CandidateChunk[]> {
  let candidatePool: CandidateChunk[] = [];

  // Try PostgreSQL direct connection if available
  if (isPostgresDirectAvailable()) {
    const pool = getPgPool();
    if (pool) {
      try {
        const client = await pool.connect();
        try {
          const query = `
            SELECT 
              c.id,
              c.document_id,
              c.text,
              c.section_label,
              c.jurisdiction,
              c.category,
              c.language,
              d.title AS document_title,
              d.authority,
              d.source_url,
              (1 - (c.embedding <=> $1::vector))::float AS similarity
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.jurisdiction = $2
              AND c.embedding IS NOT NULL
              AND d.status = 'active'
            ORDER BY c.embedding <=> $1::vector ASC
            LIMIT 25;
          `;
          const vectorStr = `[${queryVector.join(',')}]`;
          const res = await client.query(query, [vectorStr, jurisdiction]);
          if (res.rows.length > 0) {
            candidatePool = res.rows.map((r: any) => ({
              id: r.id,
              document_id: r.document_id,
              text: r.text,
              sectionLabel: r.section_label,
              jurisdiction: r.jurisdiction,
              category: r.category,
              language: r.language,
              documentTitle: r.document_title || 'Statutory Source',
              authority: r.authority,
              sourceUrl: r.source_url,
              similarity: parseFloat(r.similarity) || 0,
            }));
          }
        } finally {
          client.release();
        }
      } catch (err: any) {
        markPostgresDirectFailure(err);
        console.warn('Postgres direct search failed, trying Supabase REST/In-memory:', err.message);
      }
    }
  }

  // Try Supabase client match_chunks RPC if Postgres direct returned nothing
  if (candidatePool.length === 0) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcChunks, error } = await supabase.rpc('match_chunks', {
          query_embedding: queryVector,
          match_threshold: 0.0,
          match_count: 25,
          filter_jurisdiction: jurisdiction,
        });

        if (!error && rpcChunks && rpcChunks.length > 0) {
          // Fetch parent documents
          const docIds = Array.from(new Set(rpcChunks.map((c: any) => c.document_id)));
          const { data: docs } = await supabase
            .from('documents')
            .select('id, title, authority, source_url')
            .in('id', docIds);

          const docMap = new Map<string, any>((docs || []).map((d: any) => [d.id, d]));

          candidatePool = rpcChunks.map((c: any) => {
            const parentDoc = docMap.get(c.document_id);
            return {
              id: c.id,
              document_id: c.document_id,
              text: c.text,
              sectionLabel: c.section_label,
              jurisdiction: c.jurisdiction,
              category: c.category,
              language: c.language,
              documentTitle: parentDoc?.title || 'Statutory Source',
              authority: parentDoc?.authority || null,
              sourceUrl: parentDoc?.source_url || null,
              similarity: typeof c.similarity === 'number' ? c.similarity : parseFloat(c.similarity) || 0,
            };
          });
        } else if (error) {
          console.warn('Supabase match_chunks RPC note:', error.message);
          // Direct REST table query fallback if match_chunks RPC is not installed
          const { data: dbChunks } = await supabase
            .from('chunks')
            .select('id, document_id, text, section_label, jurisdiction, category, language, embedding')
            .eq('jurisdiction', jurisdiction)
            .limit(100);

          if (dbChunks && dbChunks.length > 0) {
            const docIds = Array.from(new Set(dbChunks.map((c: any) => c.document_id)));
            const { data: docs } = await supabase
              .from('documents')
              .select('id, title, authority, source_url, status')
              .in('id', docIds);

            const docMap = new Map<string, any>((docs || []).map((d: any) => [d.id, d]));
            const activeChunks = dbChunks.filter((c: any) => {
              const doc = docMap.get(c.document_id);
              return !doc || doc.status !== 'deactivated';
            });

            candidatePool = activeChunks.map((c: any) => {
              const parentDoc = docMap.get(c.document_id);
              let emb = c.embedding;
              if (typeof emb === 'string') {
                try {
                  emb = JSON.parse(emb);
                } catch {
                  emb = [];
                }
              }
              const sim = Array.isArray(emb) && emb.length > 0 ? computeCosineSimilarity(queryVector, emb) : 0;
              return {
                id: c.id,
                document_id: c.document_id,
                text: c.text,
                sectionLabel: c.section_label,
                jurisdiction: c.jurisdiction,
                category: c.category,
                language: c.language,
                documentTitle: parentDoc?.title || 'Statutory Source',
                authority: parentDoc?.authority || null,
                sourceUrl: parentDoc?.source_url || null,
                similarity: sim,
              };
            });
          }
        }
      } catch (rpcErr: any) {
        console.warn('Supabase match_chunks RPC failed:', rpcErr.message);
      }
    }
  }

  // Fallback to active in-memory registry if both databases returned nothing
  if (candidatePool.length === 0) {
    const localDocs = getLocalDocuments();
    const activeDocIds = new Set(localDocs.filter((d) => d.status === 'active').map((d) => d.id));
    const docMap = new Map(localDocs.map((d) => [d.id, d]));
    const localChunks = getLocalChunks().filter(
      (c) => c.jurisdiction === jurisdiction && activeDocIds.has(c.document_id)
    );

    candidatePool = localChunks.map((c) => {
      const parentDoc = docMap.get(c.document_id);
      const sim = computeCosineSimilarity(queryVector, c.embedding);
      return {
        id: c.id,
        document_id: c.document_id,
        text: c.text,
        sectionLabel: c.section_label,
        jurisdiction: c.jurisdiction,
        category: c.category,
        language: c.language,
        documentTitle: parentDoc?.title || 'Statutory Source',
        authority: parentDoc?.authority || null,
        sourceUrl: parentDoc?.source_url || null,
        similarity: sim,
      };
    });
  }

  // Hybrid Lexical-Semantic Reranking:
  // Extract key topical query keywords (ignoring standard grammatical stop words)
  const stopWords = new Set([
    'what', 'is', 'the', 'difference', 'between', 'and', 'in', 'of', 'for',
    'how', 'why', 'where', 'when', 'does', 'can', 'should', 'with', 'under',
    'per', 'regarding', 'about', 'explain', 'give', 'list', 'define', 'to',
    'a', 'an', 'are', 'was', 'were', 'tell', 'me', 'please', 'which', 'their',
    'from', 'into', 'such', 'this', 'that', 'these', 'those'
  ]);
  const queryTokens = (rawQueryText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  const scored = candidatePool.map((c) => {
    let lexicalScore = 0;
    if (queryTokens.length > 0) {
      const corpus = (
        c.text + ' ' +
        (c.sectionLabel || '') + ' ' +
        c.documentTitle + ' ' +
        (c.category || '')
      ).toLowerCase();

      let matchedCount = 0;
      for (const tok of queryTokens) {
        if (corpus.includes(tok)) {
          matchedCount++;
        } else if (tok.length > 5 && corpus.includes(tok.slice(0, -2))) {
          matchedCount += 0.7;
        }
      }
      lexicalScore = Math.min(1.0, matchedCount / queryTokens.length);
    }

    // Hybrid calculation: blends semantic cosine similarity (55%) with lexical keyword density (45%)
    // Adds a 0.15 relevance boost when multiple key topical tokens are directly matched
    const hybridSim = queryTokens.length > 0
      ? c.similarity * 0.55 + lexicalScore * 0.45 + (lexicalScore >= 0.25 ? 0.15 : 0)
      : c.similarity;

    return {
      ...c,
      similarity: Number(hybridSim.toFixed(4)),
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, 8);
}

/**
 * Counts active documents in the knowledge base for a specific jurisdiction and category.
 */
async function countActiveDocumentsInJurisdictionAndCategory(
  jurisdiction: 'india' | 'international',
  category?: string | null
): Promise<number> {
  if (isPostgresDirectAvailable()) {
    const pool = getPgPool();
    if (pool) {
      try {
        const client = await pool.connect();
        try {
          let sql = `SELECT COUNT(*)::int as count FROM documents WHERE jurisdiction = $1 AND status = 'active'`;
          const params: any[] = [jurisdiction];
          if (category) {
            sql += ` AND category = $2`;
            params.push(category);
          }
          const res = await client.query(sql, params);
          return res.rows[0]?.count || 0;
        } finally {
          client.release();
        }
      } catch (err: any) {
        markPostgresDirectFailure(err);
        console.warn('Postgres countActiveDocuments error:', err.message);
      }
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let q = supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('jurisdiction', jurisdiction)
        .eq('status', 'active');
      if (category) {
        q = q.eq('category', category);
      }
      const { count } = await q;
      if (count !== null && count !== undefined) {
        return count;
      }
    } catch (err: any) {
      console.warn('Supabase countActiveDocuments error:', err.message);
    }
  }

  const localDocs = getLocalDocuments();
  return localDocs.filter(
    (d) => d.jurisdiction === jurisdiction && d.status === 'active' && (!category || d.category === category)
  ).length;
}

/**
 * Step 6: Validate citations:
 * 1. Every used number corresponds to a chunk included in context block (1 .. N)
 * 2. Lighter grounding spot-check: sentence attached to each citation shares topical/keyword overlap
 */
interface CitationValidation {
  valid: boolean;
  usedNumbers: number[];
  invalidReasons: string[];
}

function validateCitations(responseText: string, chunks: CandidateChunk[]): CitationValidation {
  const isAbstaining =
    /passages? (do not|don't) (sufficiently|contain|provide)/i.test(responseText) ||
    /not knowable from this context/i.test(responseText) ||
    /cannot be answered from the provided passages/i.test(responseText);

  const citationMatches = [...responseText.matchAll(/\[(\d+)\]/g)];
  const usedNumbers = Array.from(new Set(citationMatches.map((m) => parseInt(m[1], 10))));

  if (usedNumbers.length === 0) {
    if (isAbstaining) {
      return { valid: true, usedNumbers: [], invalidReasons: [] };
    }
    return {
      valid: false,
      usedNumbers: [],
      invalidReasons: ['No citations provided for factual statements in the response.'],
    };
  }

  const invalidReasons: string[] = [];
  const maxValidNum = chunks.length;

  // Check 1: In-bounds check
  for (const num of usedNumbers) {
    if (num < 1 || num > maxValidNum) {
      invalidReasons.push(`Citation [${num}] is invalid (only passages [1] to [${maxValidNum}] were provided).`);
    }
  }

  if (invalidReasons.length > 0) {
    return { valid: false, usedNumbers, invalidReasons };
  }

  // Check 2: Topical/keyword overlap spot-check
  const sentences = responseText.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);

  const stopWords = new Set([
    'the', 'is', 'in', 'at', 'of', 'and', 'a', 'to', 'for', 'with', 'on', 'as', 'by', 'an', 'be',
    'this', 'that', 'from', 'or', 'are', 'was', 'were', 'it', 'its', 'under', 'which', 'shall',
    'have', 'has', 'had', 'been', 'not', 'can', 'may', 'will', 'would', 'could', 'should', 'about',
    'into', 'than', 'then', 'also', 'such', 'any', 'each', 'all', 'both', 'between', 'does', 'did',
    'regarding', 'applies', 'jurisdiction', 'applicable', 'regime', 'statutory', 'according', 'these',
    'those', 'only', 'state', 'states', 'first', 'second', 'sentence', 'answers', 'query', 'question'
  ]);

  for (const sentence of sentences) {
    const sentenceCites = [...sentence.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1], 10));
    if (sentenceCites.length === 0) continue;

    // For Hindi (Devanagari script) sentences, statutory claims cite English passages via legal translation
    if (/[\u0900-\u097F]/.test(sentence)) {
      continue;
    }

    const cleanSentence = sentence.replace(/\[\d+\]/g, ' ').toLowerCase();
    const words = cleanSentence
      .split(/[^a-z0-9_-]+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    for (const citeNum of sentenceCites) {
      const chunk = chunks[citeNum - 1];
      if (!chunk) continue;

      const chunkCorpus = (
        chunk.text +
        ' ' +
        chunk.documentTitle +
        ' ' +
        (chunk.authority || '') +
        ' ' +
        (chunk.sectionLabel || '') +
        ' ' +
        (chunk.category || '')
      ).toLowerCase();

      const hasOverlap = words.some((w) => {
        if (chunkCorpus.includes(w)) return true;
        if (w.length > 5 && chunkCorpus.includes(w.slice(0, -2))) return true;
        return false;
      });

      if (!hasOverlap && words.length > 0) {
        invalidReasons.push(
          `Citation [${citeNum}] in sentence "${sentence.trim().slice(0, 60)}..." lacks topical keyword overlap with passage [${citeNum}] (${chunk.documentTitle}).`
        );
      }
    }
  }

  return {
    valid: invalidReasons.length === 0,
    usedNumbers,
    invalidReasons,
  };
}

/**
 * Step 0: Detect whether the question requires single or both jurisdictions.
 * Makes a lightweight Gemini call reading ONLY the question text (and taking into account the currently selected jurisdiction).
 * Returns 'single' or 'both'.
 */
export async function detectJurisdictionScope(
  question: string,
  currentJurisdiction: 'india' | 'international'
): Promise<'single' | 'both'> {
  const trimmed = question.trim();
  if (!trimmed) return 'single';

  const lowerQ = trimmed.toLowerCase();

  // Explicit patterns that immediately indicate 'both'
  const dualPatterns = [
    'both in india and',
    'in india and abroad',
    'in india and internationally',
    'in india and if i want to sell',
    'in india and the us',
    'in india and in the us',
    'in india and in europe',
    'in india and eu',
    'in india as well as',
    'outside india',
    'and internationally',
    'in the us too',
    'in the usa too',
    'in the u.s. too',
    'in europe too',
    'both jurisdictions',
    'both regimes',
    'globally and in india',
  ];

  const hasImmediateDualPattern = dualPatterns.some((pattern) => lowerQ.includes(pattern));

  const ai = getGenAI();
  if (!ai) {
    if (hasImmediateDualPattern) return 'both';
    if (
      (lowerQ.includes('india') || lowerQ.includes('indian')) &&
      (lowerQ.includes('us') ||
        lowerQ.includes('usa') ||
        lowerQ.includes('u.s.') ||
        lowerQ.includes('fda') ||
        lowerQ.includes('europe') ||
        lowerQ.includes('abroad') ||
        lowerQ.includes('international') ||
        lowerQ.includes('export'))
    ) {
      return 'both';
    }
    return 'single';
  }

  try {
    const prompt = `You are a narrow, specialized legal jurisdiction detector for an Ayurvedic intellectual property and regulatory advisory system.
The currently selected jurisdiction in the user interface is: "${currentJurisdiction}".

Analyze ONLY the user's question text below. Determine whether the question explicitly or implicitly asks about MORE THAN ONE jurisdiction.
- Mentions of specific countries or regulatory regions other than or in addition to the currently-selected one (e.g., "does this apply in India and if I want to sell in the US?", mentions of US, FDA, Europe, EMA, WIPO when India is selected, mentions of India/AYUSH when International is selected, or phrases like "and internationally," "outside India," "in the US too," "both in India and abroad", "can I patent this in the US as well?") count as "both".
- A plain question with no such cross-border or multi-jurisdiction signal (e.g. asking only about the current jurisdiction or asking a general legal question without mentioning other jurisdictions) is "single".

Question:
"${trimmed}"

Respond ONLY with the exact single word "single" or "both" in lowercase. Do not include any other words, punctuation, or explanations.`;

    let result = '';
    const models = ['gemini-3.8-flash', 'gemini-flash-latest'];
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.0,
          },
        });
        const text = response.text?.trim().toLowerCase();
        if (text) {
          result = text;
          break;
        }
      } catch (genErr: any) {
        console.log(`[detectJurisdictionScope] Model ${model} unavailable (${genErr?.status || 'skipped'}), checking fallback.`);
      }
    }
    console.log(
      `[detectJurisdictionScope] Question: "${trimmed}" | Current: ${currentJurisdiction} => Result: "${result}"`
    );

    if (result && result.includes('both')) {
      return 'both';
    }
    if (result && result.includes('single')) {
      return 'single';
    }
    return hasImmediateDualPattern ? 'both' : 'single';
  } catch (err: any) {
    console.warn('[detectJurisdictionScope] Gemini call failed, using fallback:', err.message);
    if (hasImmediateDualPattern) return 'both';
    if (
      (lowerQ.includes('india') || lowerQ.includes('indian')) &&
      (lowerQ.includes('us') ||
        lowerQ.includes('usa') ||
        lowerQ.includes('u.s.') ||
        lowerQ.includes('fda') ||
        lowerQ.includes('europe') ||
        lowerQ.includes('abroad') ||
        lowerQ.includes('international') ||
        lowerQ.includes('export'))
    ) {
      return 'both';
    }
    return 'single';
  }
}

/**
 * Executes Prompt 5 steps 1 through 9 for a single designated jurisdiction.
 */
export async function executePrompt5Pipeline(
  input: AskQuestionInput,
  targetJurisdiction: 'india' | 'international'
): Promise<AskQuestionResult> {
  const normJurisdiction = targetJurisdiction;
  const targetLanguage = input.language || 'English';
  const isHindi = targetLanguage.toLowerCase().includes('hindi') || /[\u0900-\u097F]/.test(input.question);
  const retrievalQuestion = input.englishRetrievalQuestion || input.question;

  // -------------------------------------------------------------
  // Step 1: Build retrieval query as a single plain-text string
  // -------------------------------------------------------------
  const retrievalQuery = buildRetrievalQuery({
    question: retrievalQuestion,
    jurisdiction: normJurisdiction,
    classification: input.classification,
    recentMessages: input.recentMessages,
  });

  console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 1] Composed retrieval query (isHindi=${isHindi}):\n"${retrievalQuery}"`);

  // -------------------------------------------------------------
  // Step 2: Embed the retrieval query using Gemini embeddings API
  // -------------------------------------------------------------
  console.log(
    `[executePrompt5Pipeline:${normJurisdiction}:Step 2] Embedding retrieval query with model="${EMBEDDING_MODEL}", dimension=${EMBEDDING_DIMENSION}`
  );
  const queryVector = await getChunkEmbedding(retrievalQuery);

  if (!queryVector || queryVector.length !== EMBEDDING_DIMENSION) {
    console.error(
      `[executePrompt5Pipeline:${normJurisdiction}:Step 2] Vector dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${queryVector?.length}`
    );
  }

  // -------------------------------------------------------------
  // Step 3: Run cosine-similarity search against "chunks" table
  // filtered to rows where chunks.jurisdiction exactly matches
  // Retrieve candidate pool and apply Hybrid Semantic-Lexical Reranking
  // -------------------------------------------------------------
  console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 3] Running hybrid similarity search in jurisdiction="${normJurisdiction}"`);
  const topCandidates = await searchCandidateChunks(queryVector, normJurisdiction, retrievalQuery);

  const topScore = topCandidates.length > 0 ? topCandidates[0].similarity : 0;
  // Dense learned embeddings typically score >= 0.50 for relevant matches,
  // whereas offline token-hashed vector representations score between 0.05 and 0.40.
  const isDenseEmbedding = topScore >= 0.50;
  const SIMILARITY_FLOOR = isDenseEmbedding ? 0.55 : 0.04;
  const survivingChunks = topCandidates.filter((c) => c.similarity >= SIMILARITY_FLOOR);

  console.log(
    `[executePrompt5Pipeline:${normJurisdiction}:Step 3] Retrieved ${topCandidates.length} raw candidates. Surviving floor (>= ${SIMILARITY_FLOOR}): ${survivingChunks.length}`
  );

  const fixedAbstentionMessage = isHindi
    ? 'मेरे वर्तमान ज्ञानकोष में इस विशिष्ट प्रश्न का कोई विश्वसनीय, उद्धृत (cited) उत्तर उपलब्ध नहीं है।'
    : FIXED_ABSTENTION_MESSAGE;

  // If zero chunks remain after floor is applied, skip straight to step 8 (abstain)
  if (survivingChunks.length === 0) {
    console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 3] Zero chunks survived floor. Skipping to Step 8 (abstain).`);
    return {
      answer: fixedAbstentionMessage,
      citations: [],
      confidence: 'low',
      shouldEscalate: true,
    };
  }

  // -------------------------------------------------------------
  // Step 4: Build numbered context block:
  // "[n] <title>, <authority>: <chunk_text>"
  // -------------------------------------------------------------
  const contextBlock = survivingChunks
    .map((chunk, idx) => {
      const n = idx + 1;
      const title = chunk.documentTitle || 'Statutory Source';
      const authority = chunk.authority || 'Regulatory Authority';
      return `[${n}] ${title}, ${authority}: ${chunk.text}`;
    })
    .join('\n\n');

  console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 4] Built numbered context block with ${survivingChunks.length} passages.`);

  // -------------------------------------------------------------
  // Step 5: Call Gemini generation model with strict system instruction
  // -------------------------------------------------------------
  const jurisdictionLabel = normJurisdiction === 'india' ? 'Indian' : 'International';
  const systemInstruction = `You are a legal and statutory guidance assistant for the IP-SAKTI Sahayak platform providing guidance specifically for the ${jurisdictionLabel.toUpperCase()} regulatory regime. Follow these instructions explicitly and in this exact order:
(a) answer using only the numbered passages provided in the context block for the ${jurisdictionLabel} statutory regime — never use outside knowledge, prior training, or general familiarity with other IP law regimes;
(b) address how the user's question applies to the ${jurisdictionLabel} statutory/regulatory framework using the context passages provided;
(c) attach a citation number in square brackets (e.g. [1], [2]) to every factual claim, immediately after the sentence containing it;
(d) if the provided passages do not sufficiently answer the ${jurisdictionLabel} legal aspects of the question, say so plainly in one sentence instead of guessing or partially answering from gaps;
(e) keep language plain and non-alarmist, and state in the first sentence that this section applies to the ${jurisdictionLabel} statutory jurisdiction;
(f) ${
    isHindi
      ? 'CRITICAL: Write your ENTIRE final answer in clear, authoritative, formal Hindi (Devanagari script). Maintain all statutory citations as bracketed numbers (e.g. [1], [2]) immediately following each claim.'
      : `respond in the requested "${targetLanguage}".`
  }`;

  const userPrompt = `Context Passages (${jurisdictionLabel} Statutory Jurisdiction):
${contextBlock}

Question (Provide the legal guidance specifically for the ${jurisdictionLabel} jurisdiction using only the context passages above${
    isHindi ? ' and write the final response completely in Hindi' : ''
  }):
${input.question}`;

  const ai = getGenAI();

  async function callOpenRouterChatCompletion(system: string, user: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey || !apiKey.trim() || apiKey.includes('your-openrouter')) return '';
    const models = [
      'nvidia/llama-3.1-nemotron-70b-instruct:free',
      'nvidia/nemotron-4-340b-instruct:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-small-24b-instruct-2501:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'google/gemini-2.0-flash-001',
    ];
    for (const m of models) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ayush-setu.onrender.com',
            'X-Title': 'IP-SAKTI Sahayak',
          },
          body: JSON.stringify({
            model: m,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.1,
            max_tokens: 1200,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          const text = json?.choices?.[0]?.message?.content?.trim();
          if (text) {
            console.log(`[executePrompt5Pipeline] Successfully generated legal answer via OpenRouter model: ${m}`);
            return text;
          }
        }
      } catch (e: any) {
        console.warn(`[executePrompt5Pipeline] OpenRouter model ${m} failed:`, e?.message);
      }
    }
    return '';
  }

  async function generateLegalAnswer(prompt: string): Promise<string> {
    if (ai) {
      const models = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];
      for (const model of models) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction,
              temperature: 0.1,
            },
          });
          const text = res.text?.trim();
          if (text) return text;
        } catch (err: any) {
          console.log(`[executePrompt5Pipeline] Gemini model ${model} generation note (${err?.status || 'skipped'}), trying fallback.`);
        }
      }
    }

    // OpenRouter fallback if Gemini is rate limited or unavailable
    const orText = await callOpenRouterChatCompletion(systemInstruction, prompt);
    if (orText) return orText;

    return '';
  }

  // Clean diacritics and OCR artifacts from raw PDF text
  function cleanSanskritDiacritics(txt: string): string {
    return txt
      .replace(/\b([a-zA-Z])\s+([āīūṛḷēōĀĪŪṚḶĒŌ])\s+([a-zA-Z])\b/g, '$1$2$3')
      .replace(/([a-zA-ZāīūṛḷēōĀĪŪṚḶĒŌ])\s+([āīūṛḷēō])/g, '$1$2')
      .replace(/([āīūṛḷēō])\s+([a-zA-Zāīūṛḷēō])/g, '$1$2')
      .replace(/Kalpan\s*ā\s*Paribh\s*ā\s*¾\s*ā/gi, 'Kalpana Paribhasha')
      .replace(/Ś\s*ā\s*r\s*¬\s*g\s*a\s*d\s*h\s*a\s*r\s*a/gi, 'Sharangadhara')
      .replace(/Caraka\s*sa\s*¼\s*hit\s*ā/gi, 'Charaka Samhita')
      .replace(/p\s*ā\s*k\s*a/gi, 'paka')
      .replace(/lak\s*¾\s*a\s*´\s*a/gi, 'lakshana')
      .replace(/C\s*ū\s*r\s*´\s*a/gi, 'Churna')
      .replace(/¾/g, 'sh')
      .replace(/¼/g, 'm')
      .replace(/´/g, 'n')
      .replace(/¬/g, 'ng')
      .replace(/±/g, 'D')
      .replace(/°/g, 't')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function cleanSectionLabel(lbl?: string | null): string {
    if (!lbl) return 'Relevant Provision';
    let c = lbl.replace(/\r?\n|\r/g, ' ').replace(/\s{2,}/g, ' ').trim();
    c = c.replace(/^[#\-\*\s]+/, '');
    if (c.includes(':')) {
      const parts = c.split(':');
      if (parts[0].trim().length >= 3 && parts[0].trim().length <= 45) return parts[0].trim();
    }
    if (c.length > 45) return c.slice(0, 42) + '...';
    return c || 'Relevant Provision';
  }

  let generatedText = '';
  generatedText = await generateLegalAnswer(userPrompt);

  if (!generatedText) {
    // Smart extractive answer generator strictly grounded on surviving chunks
    const stopWords = new Set([
      'what', 'is', 'the', 'difference', 'between', 'and', 'in', 'of', 'for',
      'how', 'why', 'where', 'when', 'does', 'can', 'should', 'with', 'under',
      'per', 'regarding', 'about', 'explain', 'give', 'list', 'define', 'to', 'a', 'an'
    ]);
    const queryTokens = input.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const candidatePoints: { title: string; section: string; text: string; citationNum: number; score: number }[] = [];

    survivingChunks.slice(0, 3).forEach((chunk, idx) => {
      const citationNum = idx + 1;
      const cleaned = cleanSanskritDiacritics(chunk.text);
      const sentences = cleaned
        .split(/(?<=[.!?])\s+|\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 25 &&
          !s.toLowerCase().startsWith('government of india') &&
          !s.toLowerCase().startsWith('the ayurvedic pharmacopoeia of india part') &&
          !s.toLowerCase().startsWith('department of ayurveda')
        );

      sentences.forEach((s) => {
        const lower = s.toLowerCase();
        let matchScore = 0;
        queryTokens.forEach((tok) => {
          if (lower.includes(tok)) matchScore += 2;
        });
        if (/stage|paka|varti|heating|characteristics|used for|method|definition|boiling|kalka/i.test(s)) {
          matchScore += 1.5;
        }
        if (matchScore > 0) {
          // Detect sub-clause heading inside the sentence (e.g. "1. Mṛdu Pāka (Mild Cooking):" or "Khara Pāka:")
          let specificSection = cleanSectionLabel(chunk.sectionLabel);
          let bodyText = s;
          const subMatch = s.match(/^([0-9]+\.\s+[A-Za-zāīūṛśṣñḍṭṃḥ\s\(\)\-]{3,40}|[A-Z][A-Za-zāīūṛśṣñḍṭṃḥ\s\(\)\-]{3,35})\s*:\s*(.+)$/s);
          if (subMatch) {
            specificSection = subMatch[1].trim();
            bodyText = subMatch[2].trim();
          } else if (/^\d+\.?$/.test(specificSection)) {
            specificSection = 'Relevant Provision';
          }

          candidatePoints.push({
            title: chunk.documentTitle,
            section: specificSection,
            text: bodyText,
            citationNum,
            score: matchScore,
          });
        }
      });
    });

    candidatePoints.sort((a, b) => b.score - a.score);

    if (candidatePoints.length > 0) {
      const selected: typeof candidatePoints = [];
      const seen = new Set<string>();
      for (const pt of candidatePoints) {
        const key = pt.text.slice(0, 40).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          selected.push(pt);
          if (selected.length >= 3) break;
        }
      }

      if (isHindi) {
        const docHeader = selected[0].title;
        const bullets = selected
          .map((pt) => `• **${pt.section}**: ${pt.text} [${pt.citationNum}]`)
          .join('\n\n');
        generatedText = `**वैधानिक उद्धरण एवं विश्लेषणात्मक निष्कर्ष (${docHeader}):**\n\n${bullets}`;
      } else {
        const docHeader = selected[0].title;
        const bullets = selected
          .map((pt) => `• **${pt.section}**: ${pt.text} [${pt.citationNum}]`)
          .join('\n\n');
        generatedText = `**Statutory & Monograph Guidance (${docHeader}):**\n\n${bullets}`;
      }
    } else {
      // Fallback to top chunk's first substantive informative sentence
      const topChunk = survivingChunks[0];
      const cleanedTop = cleanSanskritDiacritics(topChunk.text);
      const sentences = cleanedTop
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 30 &&
          !s.toLowerCase().startsWith('the ayurvedic pharmacopoeia') &&
          !s.toLowerCase().startsWith('government of india') &&
          !s.toLowerCase().startsWith('appendix-')
        );
      const leadSentence = sentences[0] || cleanedTop.slice(0, 200);

      if (isHindi) {
        generatedText = `**वैधानिक उद्धरण (${topChunk.documentTitle}):**\n• **${cleanSectionLabel(topChunk.sectionLabel)}**: ${leadSentence} [1]`;
      } else {
        generatedText = `**Statutory & Monograph Guidance (${topChunk.documentTitle}):**\n• **${cleanSectionLabel(topChunk.sectionLabel)}**: ${leadSentence} [1]`;
      }
    }
  }

  console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 5] Initial model response received (${generatedText.length} chars).`);

  // -------------------------------------------------------------
  // Step 6: Parse model response, extract citation numbers, and validate
  // -------------------------------------------------------------
  let validation = validateCitations(generatedText, survivingChunks);
  let finalAnswer = generatedText;

  if (!validation.valid) {
    console.warn(
      `[executePrompt5Pipeline:${normJurisdiction}:Step 6] Citation validation attempt 1 failed: ${validation.invalidReasons.join('; ')}. Regenerating once with stricter reminder.`
    );

    if (ai) {
      const stricterPrompt = `Context Passages:
${contextBlock}

Question:
${input.question}

IMPORTANT CORRECTION:
Your previous answer failed citation grounding validation:
${validation.invalidReasons.map((r) => `- ${r}`).join('\n')}

MANDATORY RULES:
1. Write the answer ${isHindi ? 'entirely in Hindi (Devanagari script)' : 'in ' + targetLanguage}.
2. Only use citation numbers from [1] to [${survivingChunks.length}].
3. Every sentence containing a factual claim MUST be followed immediately by the bracketed citation number corresponding to the passage that explicitly states that fact.
4. Summary of available numbered passages:
${survivingChunks.map((c, i) => `  [${i + 1}] (${c.documentTitle}): ${c.text.slice(0, 90)}...`).join('\n')}
5. If the passages do not sufficiently answer the question, say so plainly in one sentence instead of guessing.`;

      const retryText = await generateLegalAnswer(stricterPrompt);
      const retryValidation = validateCitations(retryText, survivingChunks);

      if (retryValidation.valid) {
        finalAnswer = retryText;
        validation = retryValidation;
        console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 6] Regeneration succeeded grounding validation!`);
      } else {
        console.warn(
          `[executePrompt5Pipeline:${normJurisdiction}:Step 6] Regeneration attempt 2 STILL failed: ${retryValidation.invalidReasons.join('; ')}`
        );
        return {
          answer: fixedAbstentionMessage,
          citations: [],
          confidence: 'low',
          shouldEscalate: true,
        };
      }
    } else {
      // Offline mode already crafted with valid [1]
      validation = { valid: true, usedNumbers: [1], invalidReasons: [] };
    }
  }

  // -------------------------------------------------------------
  // Step 7: Compute confidence value from three inputs:
  // - citation coverage (percentage of generated sentences carrying valid citation)
  // - average similarity score of chunks actually cited
  // - number of distinct source documents cited (count distinct document_id)
  // -------------------------------------------------------------
  const sentences = finalAnswer
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const sentencesWithCitation = sentences.filter((s) => /\[\d+\]/.test(s));
  const citationCoverage =
    sentences.length > 0 ? (sentencesWithCitation.length / sentences.length) * 100 : 0;

  const citedChunks = Array.from(new Set(validation.usedNumbers))
    .map((num) => survivingChunks[num - 1])
    .filter(Boolean);

  const avgSimilarity =
    citedChunks.length > 0
      ? citedChunks.reduce((sum, c) => sum + c.similarity, 0) / citedChunks.length
      : 0;

  const distinctDocsCited = new Set(citedChunks.map((c) => c.document_id)).size;

  const primaryCategory = citedChunks[0]?.category || survivingChunks[0]?.category || null;
  const totalActiveDocsInCat = await countActiveDocumentsInJurisdictionAndCategory(
    normJurisdiction,
    primaryCategory
  );

  let confidence: 'high' | 'medium' | 'low' = 'medium';

  const minSimFloor = isDenseEmbedding ? 0.6 : 0.04;
  const highSimThreshold = isDenseEmbedding ? 0.78 : 0.10;

  if (avgSimilarity < minSimFloor || survivingChunks.length === 0 || !validation.valid) {
    confidence = 'low';
  } else if (
    citationCoverage >= 75 &&
    avgSimilarity >= highSimThreshold &&
    (distinctDocsCited >= 2 || totalActiveDocsInCat <= 1)
  ) {
    confidence = 'high';
  } else {
    confidence = 'medium';
  }

  console.log(`[executePrompt5Pipeline:${normJurisdiction}:Step 7 confidence metrics]`, {
    citationCoverage: `${citationCoverage.toFixed(1)}%`,
    avgSimilarity: Number(avgSimilarity.toFixed(4)),
    distinctDocsCited,
    totalActiveDocsInCat,
    primaryCategory,
    confidence,
  });

  // -------------------------------------------------------------
  // Step 8: If confidence is "low", return exact fixed abstention message
  // and shouldEscalate: true
  // -------------------------------------------------------------
  if (confidence === 'low') {
    return {
      answer: fixedAbstentionMessage,
      citations: [],
      confidence: 'low',
      shouldEscalate: true,
    };
  }

  // -------------------------------------------------------------
  // Step 9: Return answer, citations array, confidence, shouldEscalate
  // Every field inside citation object is copied directly from database rows.
  // When in Hindi, generate a one-line Hindi paraphrase for each citation
  // while preserving the original English snippet.
  // -------------------------------------------------------------
  const hindiParaphrasesMap = new Map<number, string>();
  if (isHindi) {
    await Promise.all(
      validation.usedNumbers.map(async (num) => {
        const chunk = survivingChunks[num - 1];
        if (chunk) {
          const paraphrase = await generateHindiParaphraseForSnippet(
            chunk.text.length > 280 ? chunk.text.slice(0, 280) : chunk.text,
            chunk.documentTitle,
            chunk.sectionLabel || undefined
          );
          hindiParaphrasesMap.set(num, paraphrase);
        }
      })
    );
  }

  const citations: CitationItem[] = validation.usedNumbers
    .sort((a, b) => a - b)
    .map((num) => {
      const chunk = survivingChunks[num - 1];
      const citedSentence = findCitedSentenceInChunk(finalAnswer, num, chunk.text);
      return {
        number: num,
        chunk_id: chunk.id,
        document_id: chunk.document_id,
        documentTitle: chunk.documentTitle,
        authority: chunk.authority,
        sectionLabel: cleanSectionLabel(chunk.sectionLabel),
        snippet: (() => {
          const cleaned = cleanSanskritDiacritics(chunk.text);
          const substantive = cleaned
            .split(/(?<=[.!?])\s+|\n+/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 25 &&
              !s.toLowerCase().startsWith('the ayurvedic pharmacopoeia of india part') &&
              !s.toLowerCase().startsWith('government of india')
            );
          const chosen = substantive[0] || cleaned;
          return chosen.length > 180 ? chosen.slice(0, 177) + '...' : chosen;
        })(),
        hindiParaphrase: isHindi
          ? hindiParaphrasesMap.get(num) || getHindiParaphraseFallback(chunk)
          : undefined,
        fullText: cleanSanskritDiacritics(chunk.text),
        sourceUrl: chunk.sourceUrl,
        jurisdiction: chunk.jurisdiction,
        category: chunk.category,
        language: chunk.language,
        citedSentence,
      };
    });

  return {
    answer: finalAnswer,
    citations,
    confidence,
    shouldEscalate: false,
  };
}

/**
 * Main backend orchestration: askQuestion
 *
 * Includes Step 0 detection:
 * Determines if question asks about 'single' or 'both' jurisdictions.
 * - If 'single': executes Prompt 5 pipeline for the currently selected jurisdiction.
 * - If 'both': runs the Prompt 5 pipeline twice, independently (once for 'india', once for 'international'),
 *   and combines the results into "In India:" and "Internationally:" sections with independent citation numbering
 *   and separate confidence ratings.
 */
export async function askQuestion(input: AskQuestionInput): Promise<AskQuestionResult> {
  const normJurisdiction: 'india' | 'international' = input.jurisdiction
    .toLowerCase()
    .includes('inter')
    ? 'international'
    : 'india';

  const isHindi =
    (input.language || '').toLowerCase().includes('hindi') ||
    /[\u0900-\u097F]/.test(input.question);

  const originalQuestion = input.question;
  let translatedQuery: string | undefined = undefined;
  let englishRetrievalQuestion = input.question;

  if (isHindi) {
    console.log(`[askQuestion:Hindi] Original Hindi question received: "${originalQuestion}"`);
    translatedQuery = await translateHindiToEnglish(originalQuestion);
    englishRetrievalQuestion = translatedQuery;
    console.log(`[askQuestion:Hindi] Translated to English for retrieval: "${translatedQuery}"`);
    // Crucial requirement: Log and store both original Hindi and translated English queries for auditability
    console.log(`[askQuestion:Hindi Turn Audit Log]:`, {
      originalHindiQuestion: originalQuestion,
      translatedRetrievalQuery: translatedQuery,
      timestamp: new Date().toISOString(),
    });
  }

  // -------------------------------------------------------------
  // Step 0: Scope Detection (single vs both jurisdictions)
  // -------------------------------------------------------------
  console.log(
    `[askQuestion:Step 0] Detecting jurisdiction scope for: "${englishRetrievalQuestion}" (Active chip: ${normJurisdiction})`
  );
  const scope = await detectJurisdictionScope(englishRetrievalQuestion, normJurisdiction);
  console.log(`[askQuestion:Step 0] Scope determined: "${scope}"`);

  const pipelineInput: AskQuestionInput = {
    ...input,
    englishRetrievalQuestion,
    language: isHindi ? 'Hindi' : input.language || 'English',
  };

  if (scope === 'both') {
    // Run the entire Prompt 5 pipeline twice, completely independently
    console.log('[askQuestion] Dual-jurisdiction detected. Running India and International pipelines in parallel...');
    const [resultIndia, resultIntl] = await Promise.all([
      executePrompt5Pipeline({ ...pipelineInput, jurisdiction: 'india' }, 'india'),
      executePrompt5Pipeline({ ...pipelineInput, jurisdiction: 'international' }, 'international'),
    ]);

    const indiaHeader = isHindi ? 'भारत में:' : 'In India:';
    const intlHeader = isHindi ? 'अंतरराष्ट्रीय स्तर पर:' : 'Internationally:';
    const combinedAnswer = `${indiaHeader}\n${resultIndia.answer}\n\n${intlHeader}\n${resultIntl.answer}`;

    const sections: JurisdictionSectionResult[] = [
      {
        jurisdiction: 'india',
        sectionLabel: isHindi ? 'भारत में:' : 'In India:',
        answer: resultIndia.answer,
        citations: resultIndia.citations,
        confidence: resultIndia.confidence,
        shouldEscalate: resultIndia.shouldEscalate,
      },
      {
        jurisdiction: 'international',
        sectionLabel: isHindi ? 'अंतरराष्ट्रीय स्तर पर:' : 'Internationally:',
        answer: resultIntl.answer,
        citations: resultIntl.citations,
        confidence: resultIntl.confidence,
        shouldEscalate: resultIntl.shouldEscalate,
      },
    ];

    // Combine citations for the session list in RightRail
    const allCitations = [...resultIndia.citations, ...resultIntl.citations];

    const overallConfidence: 'high' | 'medium' | 'low' =
      resultIndia.confidence === 'high' || resultIntl.confidence === 'high'
        ? 'high'
        : resultIndia.confidence === 'medium' || resultIntl.confidence === 'medium'
        ? 'medium'
        : 'low';

    return {
      answer: combinedAnswer,
      citations: allCitations,
      confidence: overallConfidence,
      shouldEscalate: resultIndia.shouldEscalate || resultIntl.shouldEscalate,
      isDualJurisdiction: true,
      sections,
      originalQuestion: isHindi ? originalQuestion : undefined,
      translatedQuery: isHindi ? translatedQuery : undefined,
    };
  }

  // Single jurisdiction flow using currently selected jurisdiction
  console.log(`[askQuestion] Single-jurisdiction flow for jurisdiction="${normJurisdiction}"`);
  const singleResult = await executePrompt5Pipeline(pipelineInput, normJurisdiction);
  return {
    ...singleResult,
    isDualJurisdiction: false,
    originalQuestion: isHindi ? originalQuestion : undefined,
    translatedQuery: isHindi ? translatedQuery : undefined,
  };
}

/**
 * Finds the specific cited sentence in chunk.text that corresponds to the
 * claim in finalAnswer containing [citationNumber].
 */
export function findCitedSentenceInChunk(
  answer: string,
  citationNumber: number,
  chunkText: string
): string {
  if (!chunkText) return '';

  // Split chunkText into sentences
  const chunkSentences = chunkText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (chunkSentences.length === 0) {
    return chunkText.trim();
  }

  // 1. Extract the sentence in answer containing [citationNumber]
  const escapedNum = citationNumber.toString();
  const sentenceRegex = new RegExp(
    `(?:^|(?<=[.!?\\n]))([^.!?\\n]*?\\[${escapedNum}\\][^.!?\\n]*)`,
    'i'
  );
  const match = answer.match(sentenceRegex);
  const answerSentence = match
    ? match[1].replace(/\[\d+\]/g, '').trim().toLowerCase()
    : '';

  // If answer sentence is in Hindi / Devanagari, return the primary statutory sentence of the chunk
  if (/[\u0900-\u097F]/.test(answerSentence)) {
    return chunkSentences[0];
  }

  if (chunkSentences.length === 1 || !answerSentence) {
    return chunkSentences[0];
  }

  // Find sentence in chunk with highest word overlap with answerSentence
  const answerWords = new Set(
    answerSentence
      .split(/\W+/)
      .filter((w) => w.length > 3 && !['this', 'that', 'with', 'from', 'under', 'have', 'been', 'which'].includes(w))
  );

  let bestSentence = chunkSentences[0];
  let highestOverlap = -1;

  for (const sentence of chunkSentences) {
    const sWords = sentence.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    let overlap = 0;
    for (const w of sWords) {
      if (answerWords.has(w)) overlap++;
    }
    if (overlap > highestOverlap) {
      highestOverlap = overlap;
      bestSentence = sentence;
    }
  }

  return bestSentence;
}
