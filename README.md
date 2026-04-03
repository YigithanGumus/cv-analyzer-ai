# cv-analyzer-ai

AI destekli CV analiz uygulamasi. PDF/DOCX yukleyip metin cikarimi, ATS odakli analiz ve iyilestirme ciktilari alirsiniz.

**Ozellikler**
- ATS skoru ve skor kirilimi (0-100)
- Rol tahmini, seviye ve uyum skoru
- Ozet + maddeli ozet
- Bolum ozetleri (deneyim, egitim, projeler, sertifikalar)
- Skill analizi (teknik, soft, eksik)
- Anahtar kelime analizi (mevcut, eksik, onerilen)
- ATS kontrolleri ve notlar
- Guclu/gelisim alanlari ve deneyim ozetleri
- Iletisim bilgileri ve CV metrikleri
- Cok dilli CV'leri Turkce yorumlama
- Gecmis analizleri tarayicida saklama (localStorage)

**Teknoloji**
- Next.js (App Router)
- Node.js runtime
- Gemini API (`@google/genai`)
- `pdf-parse` ve `mammoth`

**Gereksinimler**
- Node.js 18+ (LTS onerilir)

**Kurulum**
1. `npm install`
2. `.env` dosyasina `GEMINI_API_KEY` ekleyin.
3. `npm run dev`

`.env` ornegi:

```env
GEMINI_API_KEY=YOUR_KEY_HERE
```

**Kullanim**
1. Ana ekranda PDF veya DOCX secin.
2. Analizi baslatin.
3. Sonuclar ekranda gosterilir.

**API**
`POST /api/analyze` istegi `multipart/form-data` olarak `file` alanini bekler.

Ornek istek:

```bash
curl -X POST http://localhost:3000/api/analyze -F "file=@/path/to/cv.pdf"
```

Ornek yanit (kisaltilmis):

```json
{
  "language": "Turkce",
  "summary": "...",
  "summary_points": ["..."],
  "ats_score": 78,
  "score_breakdown": { "content": 80, "keywords": 75, "structure": 70, "clarity": 85 },
  "role_fit": { "role_guess": "Frontend Developer", "seniority_guess": "Mid-level", "fit_score": 74, "why_fit": ["..."] },
  "skills": { "technical": ["..."], "soft": ["..."], "missing": ["..."] },
  "keywords": { "present": ["..."], "missing": ["..."], "suggested": ["..."] },
  "improvements": ["..."],
  "action_items": ["..."],
  "formatting_issues": ["..."],
  "risk_flags": ["..."]
}
```

**Konfigurasyon**
- Dosya boyutu limiti: `MAX_MB` degiskeni `app/page.js` ve `app/api/analyze/route.js` icinde.
- Metin uzunluk limitleri: `MIN_CHARS`, `MAX_CHARS` `app/api/analyze/route.js` icinde.
- Model cikti uzunlugu: `maxOutputTokens` `app/api/analyze/route.js` icinde.

**Guvenlik ve Gizlilik**
- API anahtari yalnizca sunucuda (.env) tutulur, tarayiciya gonderilmez.
- CV verisi sunucuda kalici olarak saklanmaz.
- Gecmis analizler yalnizca tarayicida localStorage ile saklanir.

**Sorun Giderme**
- `GEMINI_API_KEY tanimli degil` hatasi: `.env` dosyasini kontrol edin ve dev serveri yeniden baslatin.
- `CV metni okunamadi veya cok kisa` hatasi: Taranmis PDF olabilir; OCR gerekli olabilir.
- `Sadece PDF veya DOCX` hatasi: Dosya uzantisini kontrol edin.

**Lisans**
Bu proje `LICENSE` dosyasindaki kosullarla lisanslanmistir.
