import { GoogleGenAI, Type } from '@google/genai';
import { getGenAI } from './ingestion';

export const ALLOWED_CATEGORIES = [
  'Classical/generic Ayurvedic medicine',
  'Patent/proprietary Ayurvedic medicine',
  'New/non-classical Ayurveda drug',
  'Phytopharmaceutical',
  'Ayurveda-Aahar/nutraceutical',
  'Cosmetic',
  'Other/unclear',
] as const;

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

export interface CategoryInfo {
  category: AllowedCategory;
  definition: string;
  pathway: string;
  defaultClarifyingQuestion?: string;
}

export const CLASSIFICATION_TAXONOMY: Record<AllowedCategory, CategoryInfo> = {
  'Classical/generic Ayurvedic medicine': {
    category: 'Classical/generic Ayurvedic medicine',
    definition:
      'Ayurvedic medicine manufactured strictly according to recipes described in authoritative books specified in the First Schedule of the Drugs and Cosmetics Act, 1940.',
    pathway:
      'Exempt from clinical safety trials under Rule 158B; requires proof of classical text citation in First Schedule of Drugs and Cosmetics Act, 1940 and Form 24-D manufacturing licence from State Licensing Authority.',
    defaultClarifyingQuestion:
      'Which specific authoritative text from the First Schedule (e.g., Charaka Samhita, Sushruta Samhita, AFI) contains this exact recipe?',
  },
  'Patent/proprietary Ayurvedic medicine': {
    category: 'Patent/proprietary Ayurvedic medicine',
    definition:
      'Ayurvedic medicine containing ingredients mentioned in classical texts but manufactured with modern excipients, non-classical proportions, or proprietary dosage forms under Rule 158B.',
    pathway:
      'Requires Rule 158B proof of safety (published scientific literature or pilot clinical trial data depending on whether indications are new) and State Licensing Authority Form 24-D/25-D approval.',
    defaultClarifyingQuestion:
      'Are the therapeutic indications identical to classical texts, or are you introducing new disease indications or modified proportions?',
  },
  'New/non-classical Ayurveda drug': {
    category: 'New/non-classical Ayurveda drug',
    definition:
      'Formulation with modified botanical extracts, new delivery mechanisms, or unlisted herbal adjuvants requiring safety studies or clinical data.',
    pathway:
      'Subject to CDSCO and Ayush expert committee evaluation; requires acute/sub-chronic toxicity data, heavy metal/microbial compliance, and clinical safety proof under amended Drugs and Cosmetics Rules.',
    defaultClarifyingQuestion:
      'Does the preparation utilize novel extraction solvents (e.g., hydroalcoholic/supercritical CO2) not described in classical Ayurvedic manufacturing?',
  },
  'Phytopharmaceutical': {
    category: 'Phytopharmaceutical',
    definition:
      'Purified and standardized fraction with defined minimum quantitative markers of active ingredients evaluated under CDSCO New Drug Rules.',
    pathway:
      'Full botanical drug route under CDSCO New Drug Rules (Chapter IV-A); requires chemical fingerprinting, minimum quantitative markers, and Phase I–III clinical trials before DCGI marketing permission (Form CT-20).',
    defaultClarifyingQuestion:
      'Have you isolated and quantified at least four active bioactive markers, or is this a whole extract formulation?',
  },
  'Ayurveda-Aahar/nutraceutical': {
    category: 'Ayurveda-Aahar/nutraceutical',
    definition:
      'Food, dietary supplement, or botanical wellness preparation regulated under FSSAI-AYUSH Ayurveda Aahar Regulations, 2022.',
    pathway:
      'Regulated under Food Safety and Standards (Ayurveda Aahar) Regulations, 2022 via FSSAI licensing; strict statutory prohibition against disease prevention, treatment, or cure claims on packaging.',
    defaultClarifyingQuestion:
      'Is this product marketed strictly for dietary supplementation/daily wellness, without any disease treatment or medical cure claims?',
  },
  'Cosmetic': {
    category: 'Cosmetic',
    definition:
      'Herbal preparation intended for cleansing, beautifying, or altering appearance without primary therapeutic claims under Bureau of Indian Standards (BIS) and cosmetic rules.',
    pathway:
      'Governed by Cosmetics Rules, 2020 and Bureau of Indian Standards (BIS); requires State Licensing Authority licence (Form COS-8/9); prohibited from carrying medicinal or therapeutic treatment claims.',
    defaultClarifyingQuestion:
      'Is the formulation intended solely for external topical skin/hair beauty care, or does it claim to treat skin diseases (dermatological therapy)?',
  },
  'Other/unclear': {
    category: 'Other/unclear',
    definition:
      'Formulation whose regulatory boundary or botanical composition is ambiguous or falls outside standardized AYUSH categories.',
    pathway:
      'Requires dual regulatory assessment with State Ayush Licensing Authority and FSSAI Food Safety Officer to determine whether product falls under drug or food jurisdiction.',
    defaultClarifyingQuestion:
      'Could you specify whether this formulation is intended for internal ingestion or external application, and whether you intend to make therapeutic disease claims or daily wellness/dietary claims?',
  },
};

export interface ProductFormInput {
  productNameOrDescription: string;
  ingredients: string;
  formulationBasis:
    | 'Classical text formulation'
    | 'Modified/proprietary combination'
    | 'Completely novel combination'
    | string;
  intendedUse: 'therapeutic' | 'dietary-nutraceutical' | 'cosmetic' | string;
  existingLicence: 'yes' | 'no' | 'not sure' | string;
}

export interface ClassificationResult {
  categoryName: AllowedCategory;
  categoryDefinition: string;
  regulatoryPathway: string;
  confidence: 'high' | 'medium' | 'low';
  clarifyingQuestion: string | null;
  rawInputs: ProductFormInput;
}

/**
 * Cheap, fast intent check before askQuestion:
 * Checks if question mentions a specific product/formulation rather than a general legal query.
 */
export async function checkProductIntent(question: string): Promise<'product' | 'general'> {
  const trimmed = question.trim();
  if (!trimmed) return 'general';

  // Fast heuristic regex for obvious formulations
  const lower = trimmed.toLowerCase();
  const strongProductClues = [
    'my formulation',
    'my product',
    'our product',
    'our formulation',
    'we formulated',
    'i am developing a formulation',
    'i developed a product',
    'my medicine',
    'my cream',
    'my syrup',
    'my churna',
    'my oil',
    'my capsule',
    'my tablet',
    'ingredients:',
    'contains ashwagandha and',
    'composition:',
  ];

  for (const clue of strongProductClues) {
    if (lower.includes(clue)) {
      return 'product';
    }
  }

  const ai = getGenAI();
  if (!ai) {
    // Basic regex fallback if AI unavailable
    const productKeywords = /\b(my formulation|my product|ingredients|extract of|preparation of|churna|taila|asava|arishta|capsule containing)\b/i;
    return productKeywords.test(trimmed) ? 'product' : 'general';
  }

  try {
    const prompt = `User Question: "${trimmed}"

Task: does this question describe or refer to a specific product/formulation the user has or is making (mentions ingredients, says 'my formulation', 'my product', names a specific preparation, etc.), or is it a general question about law/process/definitions with no specific product in view? Answer only product or general.`;

    let reply = '';
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
        reply = response.text?.trim().toLowerCase() || '';
        if (reply) break;
      } catch (genErr: any) {
        console.log(`[checkProductIntent] Model ${model} unavailable (${genErr?.status || 'skipped'}).`);
      }
    }

    if (reply.includes('product')) {
      return 'product';
    }
    return 'general';
  } catch (err: any) {
    console.log('[checkProductIntent] Using fallback intent detection.');
    return 'general';
  }
}

/**
 * System instruction listing the seven exact categories and their one-line definitions.
 */
function buildClassificationSystemInstruction(): string {
  return `You are a Senior Regulatory and Patent Classification Specialist for the Ministry of Ayush, CDSCO, and FSSAI in India.

Your task is to classify an Ayurvedic, herbal, or botanical product based on the user's submitted details into EXACTLY ONE of the following seven categories:

1. Classical/generic Ayurvedic medicine: Ayurvedic medicine manufactured strictly according to recipes described in authoritative books specified in the First Schedule of the Drugs and Cosmetics Act, 1940.
2. Patent/proprietary Ayurvedic medicine: Ayurvedic medicine containing ingredients mentioned in classical texts but manufactured with modern excipients, non-classical proportions, or proprietary dosage forms under Rule 158B.
3. New/non-classical Ayurveda drug: Formulation with modified botanical extracts, new delivery mechanisms, or unlisted herbal adjuvants requiring safety studies or clinical data.
4. Phytopharmaceutical: Purified and standardized fraction with defined minimum quantitative markers of active ingredients evaluated under CDSCO New Drug Rules.
5. Ayurveda-Aahar/nutraceutical: Food, dietary supplement, or botanical wellness preparation regulated under FSSAI-AYUSH Ayurveda Aahar Regulations, 2022.
6. Cosmetic: Herbal preparation intended for cleansing, beautifying, or altering appearance without primary therapeutic claims under Bureau of Indian Standards (BIS) and cosmetic rules.
7. Other/unclear: Formulation whose regulatory boundary or botanical composition is ambiguous or falls outside standardized AYUSH categories.

Output Requirements:
Return a valid JSON object with the following fields:
{
  "category": "<Exact match of one of the seven categories listed above>",
  "confidence": "high" | "medium" | "low",
  "clarifyingQuestion": "<If confidence is not high, provide exactly one specific, practical clarifying question to ask the user next. If confidence is high, this should be null.>"
}

Strict Rules:
- The "category" string MUST match one of the seven allowed names verbatim.
- If intended use is cosmetic without medical cure claims, choose "Cosmetic".
- If intended use is dietary-nutraceutical or wellness supplement without disease claims, choose "Ayurveda-Aahar/nutraceutical".
- If it is purified fractions with quantitative chemical markers under CDSCO, choose "Phytopharmaceutical".
- If based on classical texts with therapeutic claims, choose "Classical/generic Ayurvedic medicine" (if strictly followed) or "Patent/proprietary Ayurvedic medicine" (if modified proportions or novel forms).
- If information is insufficient or conflicting, choose "Other/unclear" with "medium" or "low" confidence and supply the clarifying question.`;
}

function parseAndValidateModelOutput(rawText: string): {
  valid: boolean;
  category: AllowedCategory;
  confidence: 'high' | 'medium' | 'low';
  clarifyingQuestion: string | null;
} {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    const categoryCandidate = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const confidenceCandidate =
      parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'medium';
    const clarifyingQuestion =
      typeof parsed.clarifyingQuestion === 'string' && parsed.clarifyingQuestion.trim().length > 0
        ? parsed.clarifyingQuestion.trim()
        : null;

    let matched = ALLOWED_CATEGORIES.find(
      (c) => c.toLowerCase() === categoryCandidate.toLowerCase()
    );

    if (!matched) {
      const lowerCand = categoryCandidate.toLowerCase();
      if (lowerCand.includes('classical') && !lowerCand.includes('non-classical')) {
        matched = 'Classical/generic Ayurvedic medicine';
      } else if (lowerCand.includes('patent') || lowerCand.includes('proprietary')) {
        matched = 'Patent/proprietary Ayurvedic medicine';
      } else if (lowerCand.includes('non-classical') || lowerCand.includes('new/non-classical')) {
        matched = 'New/non-classical Ayurveda drug';
      } else if (lowerCand.includes('phyto')) {
        matched = 'Phytopharmaceutical';
      } else if (lowerCand.includes('aahar') || lowerCand.includes('nutra') || lowerCand.includes('food')) {
        matched = 'Ayurveda-Aahar/nutraceutical';
      } else if (lowerCand.includes('cosmetic')) {
        matched = 'Cosmetic';
      }
    }

    if (matched) {
      return {
        valid: true,
        category: matched,
        confidence: confidenceCandidate,
        clarifyingQuestion:
          confidenceCandidate !== 'high'
            ? clarifyingQuestion || CLASSIFICATION_TAXONOMY[matched].defaultClarifyingQuestion || null
            : null,
      };
    }
  } catch (err: any) {
    console.warn('[parseAndValidateModelOutput] JSON parse failed on rawText:', rawText);
  }

  return {
    valid: false,
    category: 'Other/unclear',
    confidence: 'medium',
    clarifyingQuestion: CLASSIFICATION_TAXONOMY['Other/unclear'].defaultClarifyingQuestion || null,
  };
}

/**
 * Fallback classifier when AI is unavailable.
 */
function heuristicClassify(input: ProductFormInput): ClassificationResult {
  const intended = (input.intendedUse || '').toLowerCase();
  const basis = (input.formulationBasis || '').toLowerCase();

  let category: AllowedCategory = 'Other/unclear';
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (intended.includes('cosmetic')) {
    category = 'Cosmetic';
    confidence = 'high';
  } else if (intended.includes('dietary') || intended.includes('nutra') || intended.includes('food')) {
    category = 'Ayurveda-Aahar/nutraceutical';
    confidence = 'high';
  } else if (basis.includes('classical')) {
    category = 'Classical/generic Ayurvedic medicine';
    confidence = 'high';
  } else if (basis.includes('modified') || basis.includes('proprietary')) {
    category = 'Patent/proprietary Ayurvedic medicine';
    confidence = 'high';
  } else if (basis.includes('novel')) {
    category = 'New/non-classical Ayurveda drug';
    confidence = 'medium';
  }

  const tax = CLASSIFICATION_TAXONOMY[category];
  return {
    categoryName: category,
    categoryDefinition: tax.definition,
    regulatoryPathway: tax.pathway,
    confidence,
    clarifyingQuestion: confidence !== 'high' ? tax.defaultClarifyingQuestion || null : null,
    rawInputs: input,
  };
}

/**
 * classifyProduct:
 * Sends product form data to Gemini with system instruction listing the 7 categories.
 * Validates output against the 7 categories. If invalid, retries ONCE with stricter reminder.
 * If still invalid after retry, defaults to "Other/unclear" with medium confidence and standard clarifying question.
 */
export async function classifyProduct(input: ProductFormInput): Promise<ClassificationResult> {
  const userPrompt = `Product Formulation Information for Regulatory Classification:
- Product Name or Description: ${input.productNameOrDescription || 'Not specified'}
- Ingredients: ${input.ingredients || 'Not specified'}
- Formulation Basis: ${input.formulationBasis || 'Not specified'}
- Intended Use: ${input.intendedUse || 'Not specified'}
- Currently Manufactured under Existing Licence: ${input.existingLicence || 'Not specified'}

Please classify this product according to the 7 allowed categories and provide your assessment in JSON.`;

  const ai = getGenAI();
  if (!ai) {
    return heuristicClassify(input);
  }

  const systemInstruction = buildClassificationSystemInstruction();

  // Attempt 1
  let rawResponse = '';
  const models = ['gemini-3.8-flash', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
      rawResponse = res.text?.trim() || '';
      if (rawResponse) break;
    } catch (err: any) {
      console.log(`[classifyProduct] Model ${model} Attempt 1 note (${err?.status || 'skipped'}).`);
    }
  }

  let parsed = parseAndValidateModelOutput(rawResponse);

  // If Attempt 1 failed validation, retry ONCE with stricter reminder
  if (!parsed.valid) {
    console.log('[classifyProduct] Attempt 1 did not match category. Retrying with explicit reminder.');
    const retryPrompt = `${userPrompt}

CRITICAL CORRECTION:
Your previous response did NOT match one of the seven allowed category strings. You MUST choose EXACTLY one string from this list verbatim:
1. Classical/generic Ayurvedic medicine
2. Patent/proprietary Ayurvedic medicine
3. New/non-classical Ayurveda drug
4. Phytopharmaceutical
5. Ayurveda-Aahar/nutraceutical
6. Cosmetic
7. Other/unclear

Return valid JSON with "category", "confidence", and "clarifyingQuestion".`;

    for (const model of models) {
      try {
        const res2 = await ai.models.generateContent({
          model,
          contents: retryPrompt,
          config: {
            systemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
          },
        });
        const rawResponse2 = res2.text?.trim() || '';
        const parsed2 = parseAndValidateModelOutput(rawResponse2);
        if (parsed2.valid) {
          parsed = parsed2;
          break;
        }
      } catch (retryErr: any) {
        console.log(`[classifyProduct] Model ${model} Retry note (${retryErr?.status || 'skipped'}).`);
      }
    }

    if (!parsed.valid) {
      console.log('[classifyProduct] Defaulting to heuristic classification.');
      return heuristicClassify(input);
    }
  }

  const categoryInfo = CLASSIFICATION_TAXONOMY[parsed.category];

  return {
    categoryName: parsed.category,
    categoryDefinition: categoryInfo.definition,
    regulatoryPathway: categoryInfo.pathway,
    confidence: parsed.confidence,
    clarifyingQuestion:
      parsed.confidence !== 'high'
        ? parsed.clarifyingQuestion || categoryInfo.defaultClarifyingQuestion || null
        : null,
    rawInputs: input,
  };
}
