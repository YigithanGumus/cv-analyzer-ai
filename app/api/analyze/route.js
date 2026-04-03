import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

const MODEL = 'gemini-2.5-flash';
const MAX_MB = 10;
const MIN_CHARS = 200;
const MAX_CHARS = 14000;

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
- Hicbir alan bos olmasin. CV yetersizse ATS en iyi pratiklerine dayanarak genel ve mantikli cikarimlar uret.
- JSON disinda hicbir metin yazma.`;

const RETRY_PROMPT = `${SYSTEM_PROMPT}
Ek kural: Bos string, bos dizi, null kullanma. Her alan dolu olmak zorunda.`;

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

const DEFAULTS = {
  summary_points: [
    'CV genel amacini ve hedef rolunu daha net ifade et.',
    'Basarilari sayisal metriklerle destekle.',
    'Teknik becerileri kategori bazli sirala.',
    'Projelerde kullanilan teknolojileri belirt.',
    'Deneyim maddelerinde etkiyi vurgula.',
    'Iletisim bilgilerini ve linkleri netlestir.',
    'Kullandigin araclari ve metodolojileri ekle.',
    'Sorumluluk ve katkilarini netlestir.',
  ],
  technical: [
    'JavaScript',
    'TypeScript',
    'HTML',
    'CSS',
    'React',
    'Node.js',
    'SQL',
    'Git',
    'REST API',
    'Docker',
    'Testing',
    'CI/CD',
  ],
  soft: [
    'Iletisim',
    'Takim calismasi',
    'Problem cozme',
    'Zaman yonetimi',
    'Analitik dusunme',
    'Sorumluluk',
    'Uyum saglama',
  ],
  missing: [
    'Performans optimizasyonu',
    'Guvenlik farkindaligi',
    'Dokumantasyon',
    'Kod inceleme',
    'Sistem tasarimi',
    'Bulut servisleri',
  ],
  keywords_present: [
    'Yazilim gelistirme',
    'Web uygulamalari',
    'Front-end',
    'Back-end',
    'API',
    'Veritabani',
    'Test',
  ],
  keywords_missing: ['Optimizasyon', 'Kod kalite standartlari', 'Izleme', 'Hata ayiklama', 'Guvenlik'],
  keywords_suggested: ['Otomasyon', 'Test stratejisi', 'Sistem tasarimi', 'Performans', 'Guvenlik', 'Olceklendirme'],
  why_fit: [
    'Teknik beceriler hedef role uyumlu gorunuyor.',
    'Projelerde benzer teknolojiler kullanilmis.',
    'Takim ici isbirligi ve sorumluluk vurgusu var.',
    'Ogrenme ve gelisim motivasyonu yansiyor.',
    'Deneyim basliklari rol beklentileriyle uyumlu.',
    'Problem cozme yaklasimi gorunuyor.',
  ],
  improvements: [
    'Basarilari % ve sayi ile netlestir.',
    'Teknoloji yiginini (stack) tek yerde toplu ver.',
    'Her deneyimde gorev + etki + sonuc yapisini kullan.',
    'Projelerde rolunu ve katkini acikla.',
    'CV uzunlugunu 1-2 sayfa arasinda tut.',
    'Eslesen anahtar kelimeleri arttir.',
    'Tarih formatlarini tek tip kullan.',
    'Yabanci dil seviyeni belirt.',
    'LinkedIn ve GitHub linklerini ekle.',
    'Ozeti hedef role gore ozellestir.',
    'Otomasyon veya test orneklerini ekle.',
    'Dokumantasyon ve surec katkilarini belirt.',
  ],
  action_items: [
    'Son iki is deneyimini metriklerle guncelle.',
    'En guclu 3 projeni ustte konumlandir.',
    'Eksik teknik becerileri listene ekle.',
    'CV formatini sade bir ATS uyumlu sablona gecir.',
    'Baslik ve tarih formatlarini standardize et.',
    'Kisa bir hedef rolu cumlesi ekle.',
    'Anahtar kelime yogunlugunu arttir.',
    'Egitim ve sertifikalari netlestir.',
    'Rol/teknoloji eslesmesini acikla.',
    'Basari odakli madde yapisini uygula.',
  ],
  formatting_issues: [
    'Madde isaretleri tutarsiz gorunuyor olabilir.',
    'Baslik hiyerarsisi net degil.',
    'Tarih formatlari karisik olabilir.',
    'Paragraf araliklari dengesiz olabilir.',
    'Yazi boyutu ve bosluklar tutarsiz olabilir.',
  ],
  risk_flags: [
    'Olculebilir basari ornekleri az.',
    'Hedef rol net tanimlanmamis olabilir.',
    'Teknik beceriler ve deneyim eslesmesi zayif olabilir.',
    'Projelerin etki ve sonuc kismi yetersiz olabilir.',
    'Kritik sorumluluklar net degil.',
  ],
  notes: [
    'ATS icin sade font ve tek kolon onerilir.',
    'Tarih araliklarini ay/yil formatinda birlestir.',
    'Basliklari standart sekilde yaz (Experience, Education).',
    'Becerileri hedef role gore onceliklendir.',
  ],
  strengths: [
    'Teknik altyapi genisligi',
    'Takim ici isbirligi',
    'Problem cozme',
    'Hizli ogrenme',
    'Sorumluluk alma',
    'Sahiplenme',
  ],
  weaknesses: [
    'Metriklendirilmis basari azligi',
    'Projelerde rol/katki netligi',
    'CV yapisinda standartlasma eksigi',
    'Anahtar kelime yogunlugu',
    'Dokumantasyon vurgusu',
  ],
  experience_highlights: [
    'Coklu proje deneyimi ve farkli teknoloji kullanimi.',
    'Uygulama gelistirme ve bakim sorumlulugu.',
    'Takim ile koordinasyon ve teslim surecleri.',
    'Performans ve stabilite iyilestirmeleri.',
    'Kullanici odakli cozumler uretme.',
  ],
  recommended_roles: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Web Developer'],
};

const ROLE_KEYWORDS = [
  { role: 'Frontend Developer', keywords: ['frontend', 'react', 'vue', 'angular', 'next', 'ui', 'css', 'html'] },
  { role: 'Backend Developer', keywords: ['backend', 'node', 'express', 'django', 'flask', 'spring', 'api', 'microservice'] },
  { role: 'Full Stack Developer', keywords: ['full stack', 'fullstack', 'frontend', 'backend', 'node', 'react'] },
  { role: 'Mobile Developer', keywords: ['android', 'ios', 'react native', 'flutter', 'kotlin', 'swift'] },
  { role: 'Data Analyst', keywords: ['sql', 'data', 'analysis', 'analytics', 'power bi', 'tableau', 'excel'] },
  { role: 'Data Scientist', keywords: ['machine learning', 'ml', 'python', 'pandas', 'model', 'ai'] },
  { role: 'DevOps Engineer', keywords: ['devops', 'docker', 'kubernetes', 'ci/cd', 'aws', 'azure', 'gcp'] },
  { role: 'QA Engineer', keywords: ['qa', 'test', 'testing', 'selenium', 'cypress', 'automation'] },
  { role: 'UI/UX Designer', keywords: ['ux', 'ui', 'figma', 'design', 'wireframe', 'prototype'] },
];

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

function clampScore(score) {
  if (Number.isNaN(score)) return null;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeTextField(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const cleaned = normalizeText(value);
  return cleaned || fallback;
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

function sanitizeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => String(item || '').trim()).filter(Boolean);
}

function ensureList(list, fallbackItems) {
  const cleaned = sanitizeList(list);
  if (cleaned.length) return cleaned;
  return fallbackItems ? [...fallbackItems] : [];
}

function normalizeStatus(value) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  return cleaned || 'belirsiz';
}

function resolveScore(value, fallback) {
  const parsed = clampScore(Number(value));
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function normalizeScoreBreakdown(breakdown, fallback) {
  return {
    content: resolveScore(breakdown?.content, fallback.content),
    keywords: resolveScore(breakdown?.keywords, fallback.keywords),
    structure: resolveScore(breakdown?.structure, fallback.structure),
    clarity: resolveScore(breakdown?.clarity, fallback.clarity),
  };
}

function normalizeSections(sections) {
  const fallback = 'CV metninde bu bolum acik degil; genel degerlendirme yapildi.';
  return {
    overview: normalizeTextField(sections?.overview, fallback),
    experience: normalizeTextField(sections?.experience, fallback),
    education: normalizeTextField(sections?.education, fallback),
    projects: normalizeTextField(sections?.projects, fallback),
    certifications: normalizeTextField(sections?.certifications, fallback),
  };
}

function normalizeSkills(skills) {
  return {
    technical: ensureList(skills?.technical, DEFAULTS.technical),
    soft: ensureList(skills?.soft, DEFAULTS.soft),
    missing: ensureList(skills?.missing, DEFAULTS.missing),
  };
}

function normalizeChecks(checks) {
  return {
    contact_info: normalizeStatus(checks?.contact_info),
    date_consistency: normalizeStatus(checks?.date_consistency),
    metrics: normalizeStatus(checks?.metrics),
    length: normalizeStatus(checks?.length),
    formatting: normalizeStatus(checks?.formatting),
    bullet_consistency: normalizeStatus(checks?.bullet_consistency),
    notes: ensureList(checks?.notes, DEFAULTS.notes),
  };
}

function normalizeKeywords(keywords) {
  return {
    present: ensureList(keywords?.present, DEFAULTS.keywords_present),
    missing: ensureList(keywords?.missing, DEFAULTS.keywords_missing),
    suggested: ensureList(keywords?.suggested, DEFAULTS.keywords_suggested),
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
    location: '',
    linkedin,
    github,
    website,
  };
}

function normalizeContactInfo(info, extracted) {
  const fallback = 'Bulunamadi';
  return {
    email: normalizeTextField(info?.email, extracted.email || fallback),
    phone: normalizeTextField(info?.phone, extracted.phone || fallback),
    location: normalizeTextField(info?.location, fallback),
    linkedin: normalizeTextField(info?.linkedin, extracted.linkedin || fallback),
    github: normalizeTextField(info?.github, extracted.github || fallback),
    website: normalizeTextField(info?.website, extracted.website || fallback),
  };
}

function inferRole(text) {
  const lower = text.toLowerCase();
  const scored = ROLE_KEYWORDS.map((entry) => {
    const hits = entry.keywords.reduce((count, keyword) => (lower.includes(keyword) ? count + 1 : count), 0);
    return { role: entry.role, score: hits };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const recommended = scored.filter((entry) => entry.score > 0).slice(0, 4).map((entry) => entry.role);

  return {
    role_guess: best && best.score > 0 ? best.role : 'Yazilim Gelistirici',
    recommended_roles: recommended.length ? recommended : [...DEFAULTS.recommended_roles],
  };
}

function inferSeniority(text) {
  const lower = text.toLowerCase();
  if (/(staj|intern)/.test(lower)) return 'Stajyer';
  if (/(junior|jr|entry)/.test(lower)) return 'Junior';
  if (/(kidemli|senior|sr|lead|principal)/.test(lower)) return 'Senior';
  if (/(manager|yonetici|head|director)/.test(lower)) return 'Yonetici';
  return 'Mid-level';
}

function computeTextStats(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const avgSentenceLength = wordCount / sentenceCount;
  const sectionHits = ['experience', 'deneyim', 'education', 'egitim', 'project', 'proje', 'skills', 'beceri', 'sertifika', 'certification']
    .reduce((count, term) => (text.toLowerCase().includes(term) ? count + 1 : count), 0);
  const keywordHits = ROLE_KEYWORDS.reduce((total, entry) => {
    return total + entry.keywords.reduce((count, keyword) => (text.toLowerCase().includes(keyword) ? count + 1 : count), 0);
  }, 0);

  return { wordCount, sentenceCount, avgSentenceLength, sectionHits, keywordHits };
}

function computeFallbackScores(stats) {
  const contentBase = stats.wordCount < 200 ? 45 : stats.wordCount < 350 ? 60 : stats.wordCount < 700 ? 75 : stats.wordCount < 1000 ? 70 : 55;
  const structureBase = 40 + stats.sectionHits * 8;
  const keywordBase = 40 + stats.keywordHits * 3;
  const clarityBase = stats.avgSentenceLength < 10 ? 55 : stats.avgSentenceLength < 18 ? 75 : stats.avgSentenceLength < 25 ? 65 : 50;

  return {
    content: clampScore(contentBase),
    keywords: clampScore(keywordBase),
    structure: clampScore(structureBase),
    clarity: clampScore(clarityBase),
  };
}

function computeMetrics(stats) {
  const estimatedPages = stats.wordCount ? Math.max(1, Math.round((stats.wordCount / 450) * 10) / 10) : 1;
  const readingTime = stats.wordCount ? Math.max(1, Math.round(stats.wordCount / 180)) : 1;
  return {
    word_count: stats.wordCount,
    estimated_pages: estimatedPages,
    reading_time_minutes: readingTime,
  };
}

function normalizeRoleFit(roleFit, fallback) {
  return {
    role_guess: normalizeTextField(roleFit?.role_guess, fallback.role_guess),
    seniority_guess: normalizeTextField(roleFit?.seniority_guess, fallback.seniority_guess),
    fit_score: resolveScore(roleFit?.fit_score, fallback.fit_score),
    why_fit: ensureList(roleFit?.why_fit, DEFAULTS.why_fit),
  };
}

function isValidPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const summary = normalizeTextField(parsed.summary);
  const improvements = sanitizeList(parsed.improvements);
  const scoreOk = Number.isFinite(Number(parsed.ats_score));
  const summaryPoints = sanitizeList(parsed.summary_points);

  return summary.length >= 30 && summaryPoints.length >= 3 && improvements.length >= 4 && scoreOk;
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

async function analyzeText(text, apiKey, prompt) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `CV Metni:\n${text}`,
    config: {
      systemInstruction: prompt,
      temperature: 0.1,
      maxOutputTokens: 3500,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  return getResponseText(response);
}

function buildResult(parsed, context) {
  const summary = normalizeTextField(parsed?.summary, 'CV ozeti olusturulamadi.');
  const summary_points = ensureList(parsed?.summary_points, DEFAULTS.summary_points);
  const sections = normalizeSections(parsed?.sections);
  const skills = normalizeSkills(parsed?.skills);
  const keywords = normalizeKeywords(parsed?.keywords);

  const role_fit = normalizeRoleFit(parsed?.role_fit, context.role_fallback);
  const recommended_roles = ensureList(parsed?.recommended_roles, context.recommended_roles);
  const strengths = ensureList(parsed?.strengths, DEFAULTS.strengths);
  const weaknesses = ensureList(parsed?.weaknesses, DEFAULTS.weaknesses);
  const experience_highlights = ensureList(parsed?.experience_highlights, DEFAULTS.experience_highlights);
  const contact_info = normalizeContactInfo(parsed?.contact_info, context.contact_info);

  const ats_checks = normalizeChecks(parsed?.ats_checks);
  const score_breakdown = normalizeScoreBreakdown(parsed?.score_breakdown, context.fallback_scores);
  const improvements = ensureList(parsed?.improvements, DEFAULTS.improvements);
  const action_items = ensureList(parsed?.action_items, DEFAULTS.action_items);
  const formatting_issues = ensureList(parsed?.formatting_issues, DEFAULTS.formatting_issues);
  const risk_flags = ensureList(parsed?.risk_flags, DEFAULTS.risk_flags);

  const ats_score = resolveScore(parsed?.ats_score, context.ats_score_fallback);
  const language = 'Turkce';

  return {
    language,
    summary,
    summary_points,
    sections,
    skills,
    keywords,
    role_fit,
    recommended_roles,
    strengths,
    weaknesses,
    experience_highlights,
    contact_info,
    ats_checks,
    score_breakdown,
    improvements,
    action_items,
    formatting_issues,
    risk_flags,
    ats_score,
    cv_metrics: context.cv_metrics,
    missing_skills: skills.missing,
    tips: improvements,
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
    const stats = computeTextStats(trimmed);
    const fallback_scores = computeFallbackScores(stats);
    const cv_metrics = computeMetrics(stats);
    const role_guessing = inferRole(trimmed);
    const seniority_guess = inferSeniority(trimmed);
    const contact_info = extractContactInfo(trimmed);
    const ats_score_fallback = Math.round(
      (fallback_scores.content + fallback_scores.keywords + fallback_scores.structure + fallback_scores.clarity) / 4
    );
    const fit_score_fallback = Math.round((fallback_scores.keywords + fallback_scores.content) / 2);

    let rawOutput = await analyzeText(trimmed, apiKey, SYSTEM_PROMPT);
    let parsed = safeParseJson(rawOutput);
    let valid = isValidPayload(parsed);

    if (!valid) {
      rawOutput = await analyzeText(trimmed, apiKey, RETRY_PROMPT);
      parsed = safeParseJson(rawOutput);
      valid = isValidPayload(parsed);
    }

    const result = buildResult(parsed, {
      fallback_scores,
      cv_metrics,
      ats_score_fallback,
      contact_info,
      recommended_roles: role_guessing.recommended_roles,
      role_fallback: {
        role_guess: role_guessing.role_guess,
        seniority_guess,
        fit_score: fit_score_fallback,
      },
    });

    if (!valid) {
      return NextResponse.json(
        {
          ...result,
          warnings: ['Model cikti alani eksik veya uyumsuz. Varsayimlar kullanildi.'],
        },
        { status: 200 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json(
      { error: 'Analiz sirasinda beklenmeyen bir hata olustu.' },
      { status: 500 }
    );
  }
}
