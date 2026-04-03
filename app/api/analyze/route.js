import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

const MODEL = 'gemini-2.5-flash';
const MAX_MB = 10;
const MIN_CHARS = 200;
const MAX_CHARS = 14000;
const MAX_OUTPUT_TOKENS = 5000;
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `Sen bir ATS odakli kariyer danismanisin.
Tum cikti Turkce olacak. CV farkli bir dildeyse icerigi Turkceye cevirip yorumla.
Yalnizca gecerli JSON dondur.
JSON semasi:
{
  "language": string,
  "summary": string,
  "summary_points": string[],
  "sections": {
    "overview": string,
    "experience": string,
    "education": string,
    "projects": string,
    "certifications": string
  },
  "skills": {
    "technical": string[],
    "soft": string[],
    "missing": string[]
  },
  "keywords": {
    "present": string[],
    "missing": string[],
    "suggested": string[]
  },
  "role_fit": {
    "role_guess": string,
    "seniority_guess": string,
    "fit_score": number,
    "why_fit": string[]
  },
  "recommended_roles": string[],
  "strengths": string[],
  "weaknesses": string[],
  "experience_highlights": string[],
  "contact_info": {
    "email": string,
    "phone": string,
    "location": string,
    "linkedin": string,
    "github": string,
    "website": string
  },
  "ats_checks": {
    "contact_info": "ok" | "eksik",
    "date_consistency": "ok" | "tutarsiz",
    "metrics": "ok" | "eksik",
    "length": "ok" | "cok_uzun" | "cok_kisa",
    "formatting": "ok" | "sorunlu",
    "bullet_consistency": "ok" | "tutarsiz",
    "notes": string[]
  },
  "score_breakdown": {
    "content": number,
    "keywords": number,
    "structure": number,
    "clarity": number
  },
  "ats_score": number,
  "improvements": string[],
  "action_items": string[],
  "formatting_issues": string[],
  "risk_flags": string[]
}
Kurallar:
- language her zaman "Turkce" yaz.
- summary 140-190 kelime olsun.
- summary_points 8-12 madde olsun.
- sections alanlari 4-7 cumlelik kisa ozet olsun. Bilgi net degilse genel yorumla doldur.
- skills.technical 12-20 madde, skills.soft 8-14 madde, skills.missing 10-16 madde olsun.
- keywords.present/missing/suggested 12-20 madde olsun.
- role_fit.why_fit 6-10 madde olsun.
- recommended_roles 4-7 madde olsun.
- strengths 6-10 madde, weaknesses 6-10 madde olsun.
- experience_highlights 5-9 madde olsun.
- ats_score ve score_breakdown degerleri 0-100 arasi tam sayi olsun.
- improvements 12-18 madde, action_items 10-14 madde olsun.
- formatting_issues 5-10 madde, risk_flags 5-9 madde olsun.
- contact_info alanlarini bos birakma; veri yoksa "Bulunamadi" yaz.
- CV yetersizse ATS en iyi pratiklerine dayanarak genel ve mantikli cikarimlar uret.
- contact_info disinda "Bulunamadi" kullanma, her alan icin anlamli icerik yaz.
- Hicbir alan bos olmasin.
- JSON disinda hicbir metin yazma.`;

const REPAIR_PROMPT = `${SYSTEM_PROMPT}
Ek gorev: CV metni ve Onceki JSON verilecek. Onceki JSON'daki eksik veya kisa alanlari
kurallara uygun sekilde genislet. Tum alanlar dolu olmali ve kurallara uymali.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string' },
    summary: { type: 'string' },
    summary_points: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'object',
      properties: {
        overview: { type: 'string' },
        experience: { type: 'string' },
        education: { type: 'string' },
        projects: { type: 'string' },
        certifications: { type: 'string' },
      },
      required: ['overview', 'experience', 'education', 'projects', 'certifications'],
    },
    skills: {
      type: 'object',
      properties: {
        technical: { type: 'array', items: { type: 'string' } },
        soft: { type: 'array', items: { type: 'string' } },
        missing: { type: 'array', items: { type: 'string' } },
      },
      required: ['technical', 'soft', 'missing'],
    },
    keywords: {
      type: 'object',
      properties: {
        present: { type: 'array', items: { type: 'string' } },
        missing: { type: 'array', items: { type: 'string' } },
        suggested: { type: 'array', items: { type: 'string' } },
      },
      required: ['present', 'missing', 'suggested'],
    },
    role_fit: {
      type: 'object',
      properties: {
        role_guess: { type: 'string' },
        seniority_guess: { type: 'string' },
        fit_score: { type: 'integer' },
        why_fit: { type: 'array', items: { type: 'string' } },
      },
      required: ['role_guess', 'seniority_guess', 'fit_score', 'why_fit'],
    },
    recommended_roles: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    experience_highlights: { type: 'array', items: { type: 'string' } },
    contact_info: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
        location: { type: 'string' },
        linkedin: { type: 'string' },
        github: { type: 'string' },
        website: { type: 'string' },
      },
      required: ['email', 'phone', 'location', 'linkedin', 'github', 'website'],
    },
    ats_checks: {
      type: 'object',
      properties: {
        contact_info: { type: 'string' },
        date_consistency: { type: 'string' },
        metrics: { type: 'string' },
        length: { type: 'string' },
        formatting: { type: 'string' },
        bullet_consistency: { type: 'string' },
        notes: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'contact_info',
        'date_consistency',
        'metrics',
        'length',
        'formatting',
        'bullet_consistency',
        'notes',
      ],
    },
    score_breakdown: {
      type: 'object',
      properties: {
        content: { type: 'integer' },
        keywords: { type: 'integer' },
        structure: { type: 'integer' },
        clarity: { type: 'integer' },
      },
      required: ['content', 'keywords', 'structure', 'clarity'],
    },
    ats_score: { type: 'integer' },
    improvements: { type: 'array', items: { type: 'string' } },
    action_items: { type: 'array', items: { type: 'string' } },
    formatting_issues: { type: 'array', items: { type: 'string' } },
    risk_flags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'language',
    'summary',
    'summary_points',
    'sections',
    'skills',
    'keywords',
    'role_fit',
    'recommended_roles',
    'strengths',
    'weaknesses',
    'experience_highlights',
    'contact_info',
    'ats_checks',
    'score_breakdown',
    'ats_score',
    'improvements',
    'action_items',
    'formatting_issues',
    'risk_flags',
  ],
};

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeTextField(value) {
  if (typeof value !== 'string') return '';
  return normalizeText(value);
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item || '').trim()).filter(Boolean);
}

function toIntScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function isValidScore(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 100;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value, min = 1) {
  return Array.isArray(value) && value.filter(Boolean).length >= min;
}

function getResponseText(response) {
  if (!response) return '';
  if (typeof response.text === 'function') {
    const text = response.text();
    if (text) return text;
  }
  if (typeof response.text === 'string' && response.text) return response.text;

  const candidates = response.candidates || response?.response?.candidates || [];
  const parts = candidates?.[0]?.content?.parts || [];
  const merged = parts.map((part) => part?.text || '').join('').trim();
  return merged;
}

function safeParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function computeMetrics(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const estimatedPages = wordCount ? Math.max(1, Math.round((wordCount / 450) * 10) / 10) : 1;
  const readingTime = wordCount ? Math.max(1, Math.round(wordCount / 180)) : 1;
  return {
    word_count: wordCount,
    estimated_pages: estimatedPages,
    reading_time_minutes: readingTime,
  };
}

function extractContactInfo(text) {
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?\d{1,3}[\s-]?)?(\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{2,4}[\s-]?\d{2,4}/);
  const urlMatches = Array.from(text.matchAll(/https?:\/\/[^\s]+/gi)).map((match) => match[0]);

  const linkedin = urlMatches.find((url) => url.toLowerCase().includes('linkedin')) || '';
  const github = urlMatches.find((url) => url.toLowerCase().includes('github')) || '';
  const website = urlMatches.find((url) => !url.toLowerCase().includes('linkedin') && !url.toLowerCase().includes('github')) || '';

  return {
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    linkedin,
    github,
    website,
  };
}

function collectIssues(parsed) {
  const issues = [];

  if (!parsed || typeof parsed !== 'object') {
    issues.push('JSON parse edilemedi');
    return issues;
  }

  if (!isNonEmptyString(parsed.language)) issues.push('language bos');
  if (!isNonEmptyString(parsed.summary)) issues.push('summary bos');
  if (!isNonEmptyArray(parsed.summary_points, 6)) issues.push('summary_points en az 6 madde olmali');

  const sections = parsed.sections || {};
  if (!isNonEmptyString(sections.overview)) issues.push('sections.overview bos');
  if (!isNonEmptyString(sections.experience)) issues.push('sections.experience bos');
  if (!isNonEmptyString(sections.education)) issues.push('sections.education bos');
  if (!isNonEmptyString(sections.projects)) issues.push('sections.projects bos');
  if (!isNonEmptyString(sections.certifications)) issues.push('sections.certifications bos');

  const skills = parsed.skills || {};
  if (!isNonEmptyArray(skills.technical, 10)) issues.push('skills.technical en az 10 madde olmali');
  if (!isNonEmptyArray(skills.soft, 6)) issues.push('skills.soft en az 6 madde olmali');
  if (!isNonEmptyArray(skills.missing, 8)) issues.push('skills.missing en az 8 madde olmali');

  const keywords = parsed.keywords || {};
  if (!isNonEmptyArray(keywords.present, 10)) issues.push('keywords.present en az 10 madde olmali');
  if (!isNonEmptyArray(keywords.missing, 10)) issues.push('keywords.missing en az 10 madde olmali');
  if (!isNonEmptyArray(keywords.suggested, 10)) issues.push('keywords.suggested en az 10 madde olmali');

  const roleFit = parsed.role_fit || {};
  if (!isNonEmptyString(roleFit.role_guess)) issues.push('role_fit.role_guess bos');
  if (!isNonEmptyString(roleFit.seniority_guess)) issues.push('role_fit.seniority_guess bos');
  if (!isValidScore(roleFit.fit_score)) issues.push('role_fit.fit_score 0-100 olmali');
  if (!isNonEmptyArray(roleFit.why_fit, 4)) issues.push('role_fit.why_fit en az 4 madde olmali');

  if (!isNonEmptyArray(parsed.recommended_roles, 3)) issues.push('recommended_roles en az 3 madde olmali');
  if (!isNonEmptyArray(parsed.strengths, 4)) issues.push('strengths en az 4 madde olmali');
  if (!isNonEmptyArray(parsed.weaknesses, 4)) issues.push('weaknesses en az 4 madde olmali');
  if (!isNonEmptyArray(parsed.experience_highlights, 4)) issues.push('experience_highlights en az 4 madde olmali');

  const contact = parsed.contact_info || {};
  if (!isNonEmptyString(contact.email)) issues.push('contact_info.email bos');
  if (!isNonEmptyString(contact.phone)) issues.push('contact_info.phone bos');
  if (!isNonEmptyString(contact.location)) issues.push('contact_info.location bos');
  if (!isNonEmptyString(contact.linkedin)) issues.push('contact_info.linkedin bos');
  if (!isNonEmptyString(contact.github)) issues.push('contact_info.github bos');
  if (!isNonEmptyString(contact.website)) issues.push('contact_info.website bos');

  const checks = parsed.ats_checks || {};
  if (!isNonEmptyString(checks.contact_info)) issues.push('ats_checks.contact_info bos');
  if (!isNonEmptyString(checks.date_consistency)) issues.push('ats_checks.date_consistency bos');
  if (!isNonEmptyString(checks.metrics)) issues.push('ats_checks.metrics bos');
  if (!isNonEmptyString(checks.length)) issues.push('ats_checks.length bos');
  if (!isNonEmptyString(checks.formatting)) issues.push('ats_checks.formatting bos');
  if (!isNonEmptyString(checks.bullet_consistency)) issues.push('ats_checks.bullet_consistency bos');
  if (!isNonEmptyArray(checks.notes, 3)) issues.push('ats_checks.notes en az 3 madde olmali');

  const breakdown = parsed.score_breakdown || {};
  if (!isValidScore(breakdown.content)) issues.push('score_breakdown.content 0-100 olmali');
  if (!isValidScore(breakdown.keywords)) issues.push('score_breakdown.keywords 0-100 olmali');
  if (!isValidScore(breakdown.structure)) issues.push('score_breakdown.structure 0-100 olmali');
  if (!isValidScore(breakdown.clarity)) issues.push('score_breakdown.clarity 0-100 olmali');

  if (!isValidScore(parsed.ats_score)) issues.push('ats_score 0-100 olmali');
  if (!isNonEmptyArray(parsed.improvements, 8)) issues.push('improvements en az 8 madde olmali');
  if (!isNonEmptyArray(parsed.action_items, 6)) issues.push('action_items en az 6 madde olmali');
  if (!isNonEmptyArray(parsed.formatting_issues, 4)) issues.push('formatting_issues en az 4 madde olmali');
  if (!isNonEmptyArray(parsed.risk_flags, 3)) issues.push('risk_flags en az 3 madde olmali');

  return issues;
}

function isValidPayload(parsed) {
  return collectIssues(parsed).length === 0;
}

async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractTextFromFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === 'pdf') {
    return extractPdfText(buffer);
  }

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  return '';
}

async function analyzeText(text, apiKey, prompt, hints, previousJson, issues) {
  const ai = new GoogleGenAI({ apiKey });
  const parts = [`CV Metni:\n${text}`];

  if (hints) {
    parts.push(`Ek Ipuclari (otomatik):\n${JSON.stringify(hints)}`);
  }
  if (previousJson && typeof previousJson === 'object') {
    parts.push(`Onceki JSON:\n${JSON.stringify(previousJson)}`);
  }
  if (issues && issues.length) {
    parts.push(`Duzeltilecek noktalar:\n- ${issues.join('\n- ')}`);
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: parts.join('\n\n'),
    config: {
      systemInstruction: prompt,
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  return getResponseText(response);
}

function buildResult(parsed, cvMetrics) {
  return {
    language: normalizeTextField(parsed?.language),
    summary: normalizeTextField(parsed?.summary),
    summary_points: sanitizeList(parsed?.summary_points),
    sections: {
      overview: normalizeTextField(parsed?.sections?.overview),
      experience: normalizeTextField(parsed?.sections?.experience),
      education: normalizeTextField(parsed?.sections?.education),
      projects: normalizeTextField(parsed?.sections?.projects),
      certifications: normalizeTextField(parsed?.sections?.certifications),
    },
    skills: {
      technical: sanitizeList(parsed?.skills?.technical),
      soft: sanitizeList(parsed?.skills?.soft),
      missing: sanitizeList(parsed?.skills?.missing),
    },
    keywords: {
      present: sanitizeList(parsed?.keywords?.present),
      missing: sanitizeList(parsed?.keywords?.missing),
      suggested: sanitizeList(parsed?.keywords?.suggested),
    },
    role_fit: {
      role_guess: normalizeTextField(parsed?.role_fit?.role_guess),
      seniority_guess: normalizeTextField(parsed?.role_fit?.seniority_guess),
      fit_score: toIntScore(parsed?.role_fit?.fit_score),
      why_fit: sanitizeList(parsed?.role_fit?.why_fit),
    },
    recommended_roles: sanitizeList(parsed?.recommended_roles),
    strengths: sanitizeList(parsed?.strengths),
    weaknesses: sanitizeList(parsed?.weaknesses),
    experience_highlights: sanitizeList(parsed?.experience_highlights),
    contact_info: {
      email: normalizeTextField(parsed?.contact_info?.email),
      phone: normalizeTextField(parsed?.contact_info?.phone),
      location: normalizeTextField(parsed?.contact_info?.location),
      linkedin: normalizeTextField(parsed?.contact_info?.linkedin),
      github: normalizeTextField(parsed?.contact_info?.github),
      website: normalizeTextField(parsed?.contact_info?.website),
    },
    ats_checks: {
      contact_info: normalizeTextField(parsed?.ats_checks?.contact_info),
      date_consistency: normalizeTextField(parsed?.ats_checks?.date_consistency),
      metrics: normalizeTextField(parsed?.ats_checks?.metrics),
      length: normalizeTextField(parsed?.ats_checks?.length),
      formatting: normalizeTextField(parsed?.ats_checks?.formatting),
      bullet_consistency: normalizeTextField(parsed?.ats_checks?.bullet_consistency),
      notes: sanitizeList(parsed?.ats_checks?.notes),
    },
    score_breakdown: {
      content: toIntScore(parsed?.score_breakdown?.content),
      keywords: toIntScore(parsed?.score_breakdown?.keywords),
      structure: toIntScore(parsed?.score_breakdown?.structure),
      clarity: toIntScore(parsed?.score_breakdown?.clarity),
    },
    ats_score: toIntScore(parsed?.ats_score),
    improvements: sanitizeList(parsed?.improvements),
    action_items: sanitizeList(parsed?.action_items),
    formatting_issues: sanitizeList(parsed?.formatting_issues),
    risk_flags: sanitizeList(parsed?.risk_flags),
    cv_metrics: cvMetrics,
    missing_skills: sanitizeList(parsed?.skills?.missing),
    tips: sanitizeList(parsed?.improvements),
  };
}

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY tanimli degil. Sunucu konfigurasyonunu kontrol edin.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Gecerli bir dosya yukleyin.' }, { status: 400 });
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `Dosya boyutu ${MAX_MB}MB sinirini asiyor.` },
        { status: 413 }
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(extension)) {
      return NextResponse.json(
        { error: 'Sadece PDF veya DOCX dosyalari desteklenir.' },
        { status: 400 }
      );
    }

    const extracted = await extractTextFromFile(file);
    const normalized = normalizeText(extracted);

    if (!normalized || normalized.length < MIN_CHARS) {
      return NextResponse.json(
        { error: 'CV metni okunamadi veya cok kisa.' },
        { status: 422 }
      );
    }

    const trimmed = normalized.slice(0, MAX_CHARS);
    const cvMetrics = computeMetrics(trimmed);
    const hints = extractContactInfo(trimmed);

    let parsed = null;
    let issues = ['Ilk deneme yapilmadi'];
    let previousJson = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const prompt = attempt === 0 ? SYSTEM_PROMPT : REPAIR_PROMPT;
      const rawOutput = await analyzeText(trimmed, apiKey, prompt, hints, previousJson, issues);
      parsed = safeParseJson(rawOutput);
      issues = collectIssues(parsed);
      if (issues.length === 0) break;
      if (parsed && typeof parsed === 'object') {
        previousJson = parsed;
      }
    }

    if (!isValidPayload(parsed)) {
      return NextResponse.json(
        {
          error:
            'Model yeterli ve eksiksiz cikti uretemedi. Lutfen tekrar deneyin veya CV metnini genisletin.',
          details: issues,
        },
        { status: 422 }
      );
    }

    const result = buildResult(parsed, cvMetrics);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { error: 'Analiz sirasinda beklenmeyen bir hata olustu.' },
      { status: 500 }
    );
  }
}
