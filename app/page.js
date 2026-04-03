'use client';

import { useEffect, useMemo, useState } from 'react';

const MAX_MB = 10;
const HISTORY_LIMIT = 12;
const HISTORY_KEY = 'cv_history';

const STATUS_MAP = {
  ok: { label: 'OK', tone: 'good' },
  eksik: { label: 'Eksik', tone: 'bad' },
  tutarsiz: { label: 'Tutarsiz', tone: 'warn' },
  sorunlu: { label: 'Sorunlu', tone: 'warn' },
  cok_uzun: { label: 'Cok uzun', tone: 'warn' },
  cok_kisa: { label: 'Cok kisa', tone: 'warn' },
  belirsiz: { label: 'Belirsiz', tone: 'muted' },
};

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
  } catch {
    return '';
  }
}

function statusMeta(value) {
  if (!value) return STATUS_MAP.belirsiz;
  return STATUS_MAP[value] || { label: value.replace(/_/g, ' '), tone: 'muted' };
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedHistory = window.localStorage.getItem(HISTORY_KEY);
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed)) setHistory(parsed);
      } catch {
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const fileLabel = useMemo(() => {
    if (!file) return 'PDF veya DOCX dosyasi secin';
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return `${file.name} (${sizeMb} MB)`;
  }, [file]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!file) {
      setError('Lutfen bir CV dosyasi secin.');
      return;
    }

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Dosya boyutu ${MAX_MB}MB sinirini asiyor.`);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || 'Analiz sirasinda bir hata olustu.');
        return;
      }

      setResult(data);

      const entry = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        file_name: file.name,
        created_at: new Date().toISOString(),
        summary: data.summary || '',
        summary_points: data.summary_points || [],
        sections: data.sections || null,
        skills: data.skills || null,
        keywords: data.keywords || null,
        role_fit: data.role_fit || null,
        recommended_roles: data.recommended_roles || [],
        strengths: data.strengths || [],
        weaknesses: data.weaknesses || [],
        experience_highlights: data.experience_highlights || [],
        contact_info: data.contact_info || null,
        cv_metrics: data.cv_metrics || null,
        ats_checks: data.ats_checks || null,
        score_breakdown: data.score_breakdown || null,
        improvements: data.improvements || null,
        action_items: data.action_items || null,
        formatting_issues: data.formatting_issues || null,
        risk_flags: data.risk_flags || null,
        missing_skills: data.missing_skills || [],
        tips: data.tips || [],
        ats_score: data.ats_score ?? null,
        language: data.language || '',
      };

      setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));
    } catch (err) {
      setError('Sunucuya ulasilamadi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistory = (entry) => {
    setResult(entry);
    setError('');
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const skills = result?.skills || {
    technical: [],
    soft: [],
    missing: result?.missing_skills || [],
  };
  const improvements = result?.improvements || result?.tips || [];
  const sections = result?.sections || {};
  const scoreBreakdown = result?.score_breakdown || {};
  const atsChecks = result?.ats_checks || {};
  const keywords = result?.keywords || {};
  const roleFit = result?.role_fit || {};
  const summaryPoints = result?.summary_points || [];
  const recommendedRoles = safeArray(result?.recommended_roles);
  const strengths = safeArray(result?.strengths);
  const weaknesses = safeArray(result?.weaknesses);
  const experienceHighlights = safeArray(result?.experience_highlights);
  const contactInfo = result?.contact_info || {};
  const cvMetrics = result?.cv_metrics || {};

  const hasMissingSkills = safeArray(skills.missing).length > 0;
  const hasTips = safeArray(improvements).length > 0;

  const breakdownItems = [
    { key: 'content', label: 'Icerik', value: scoreBreakdown.content },
    { key: 'keywords', label: 'Anahtar Kelime', value: scoreBreakdown.keywords },
    { key: 'structure', label: 'Yapi', value: scoreBreakdown.structure },
    { key: 'clarity', label: 'Netlik', value: scoreBreakdown.clarity },
  ];

  const atsCheckItems = [
    { key: 'contact_info', label: 'Iletisim Bilgileri', value: atsChecks.contact_info },
    { key: 'date_consistency', label: 'Tarih Tutarliligi', value: atsChecks.date_consistency },
    { key: 'metrics', label: 'Olculebilir Basari', value: atsChecks.metrics },
    { key: 'length', label: 'Uzunluk', value: atsChecks.length },
    { key: 'formatting', label: 'Format', value: atsChecks.formatting },
    { key: 'bullet_consistency', label: 'Madde Tutarliligi', value: atsChecks.bullet_consistency },
  ];

  return (
    <main>
      <section className="hero">
        <div>
          <span className="tag">AI Destekli CV Analizi</span>
          <h1>CV&apos;nizi yukleyin, eksik skill&apos;leri ve ATS skorunu saniyeler icinde alin.</h1>
          <p className="subtitle">
            Sisteminiz CV metnini cozer, ozgun bir ozet uretir, pozisyonunuz icin eksik kalan
            becerileri listeler ve ATS uyumluluk skorunu verir.
          </p>
          <p className="helper">Desteklenen formatlar: PDF, DOCX. Maksimum dosya boyutu {MAX_MB}MB.</p>
        </div>
        <div className="panel">
          <form onSubmit={handleSubmit}>
            <div className="dropzone">
              <strong>CV Dosyanizi Secin</strong>
              <span className="helper">Dosya tek seferde analiz edilir; veri sunucuda kalici olarak saklanmaz.</span>
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <span className="badge">{fileLabel}</span>
            </div>
            <div className="actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Analiz ediliyor...' : 'Analizi Baslat'}
              </button>
              <span className="helper">Analiz ~10-30 saniye surebilir.</span>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </div>
      </section>

      {result && (
        <section className="panel">
          <h2>Analiz Sonucu</h2>
          {result.warnings?.length ? (
            <div className="warning">
              {result.warnings.map((warning, index) => (
                <div key={`${warning}-${index}`}>{warning}</div>
              ))}
            </div>
          ) : null}

          <div className="grid">
            <div className="card">
              <div className="badge">ATS Skoru</div>
              <div className="score">{result.ats_score ?? '?'}</div>
              <p className="helper">0-100 arasi, daha yuksek daha iyi.</p>
            </div>
            <div className="card">
              <div className="badge">Skor Kirilimi</div>
              <div className="breakdown">
                {breakdownItems.map((item) => (
                  <div key={item.key} className="breakdown-row">
                    <div className="breakdown-title">
                      <span>{item.label}</span>
                      <span className="badge">{item.value ?? '?'}</span>
                    </div>
                    <div className="meter">
                      <span style={{ width: `${item.value ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="badge">Dil ve Profil</div>
              <div className="profile-grid">
                <div>
                  <div className="muted">Dil</div>
                  <div>{result.language || 'Turkce'}</div>
                </div>
                <div>
                  <div className="muted">Rol Tahmini</div>
                  <div>{roleFit.role_guess || 'Belirlenemedi'}</div>
                </div>
                <div>
                  <div className="muted">Seviye</div>
                  <div>{roleFit.seniority_guess || 'Belirlenemedi'}</div>
                </div>
                <div>
                  <div className="muted">Uyum Skoru</div>
                  <div className="badge">{roleFit.fit_score ?? '?'}</div>
                </div>
              </div>
              {safeArray(roleFit.why_fit).length ? (
                <ul className="list">
                  {safeArray(roleFit.why_fit).map((item, index) => (
                    <li key={`${item}-${index}`}>- {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="card">
              <div className="badge">Ozet</div>
              <p className="helper" style={{ marginTop: '12px' }}>
                {result.summary || 'Ozet bulunamadi.'}
              </p>
              {safeArray(summaryPoints).length ? (
                <ul className="list">
                  {safeArray(summaryPoints).map((point, index) => (
                    <li key={`${point}-${index}`}>- {point}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="section-block">
            <h3>Iyilestirme Adimlari</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Iyilestirmeler</div>
                {hasTips ? (
                  <ul className="list">
                    {safeArray(improvements).map((tip, index) => (
                      <li key={`${tip}-${index}`}>- {tip}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Iyilestirme onerisi olusmadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Aksiyon Plani</div>
                {safeArray(result.action_items).length ? (
                  <ul className="list">
                    {safeArray(result.action_items).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Aksiyon plani olusmadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Profil ve Metrikler</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Iletisim Bilgileri</div>
                <ul className="kv-list">
                  <li>
                    <span className="label">E-posta</span>
                    <span>{contactInfo.email || 'Bulunamadi'}</span>
                  </li>
                  <li>
                    <span className="label">Telefon</span>
                    <span>{contactInfo.phone || 'Bulunamadi'}</span>
                  </li>
                  <li>
                    <span className="label">Konum</span>
                    <span>{contactInfo.location || 'Bulunamadi'}</span>
                  </li>
                  <li>
                    <span className="label">LinkedIn</span>
                    <span>{contactInfo.linkedin || 'Bulunamadi'}</span>
                  </li>
                  <li>
                    <span className="label">GitHub</span>
                    <span>{contactInfo.github || 'Bulunamadi'}</span>
                  </li>
                  <li>
                    <span className="label">Web</span>
                    <span>{contactInfo.website || 'Bulunamadi'}</span>
                  </li>
                </ul>
              </div>
              <div className="card">
                <div className="badge">CV Metrikleri</div>
                <ul className="kv-list">
                  <li>
                    <span className="label">Kelime Sayisi</span>
                    <span>{cvMetrics.word_count ?? '-'}</span>
                  </li>
                  <li>
                    <span className="label">Tahmini Sayfa</span>
                    <span>{cvMetrics.estimated_pages ?? '-'}</span>
                  </li>
                  <li>
                    <span className="label">Okuma Suresi</span>
                    <span>{cvMetrics.reading_time_minutes ?? '-'} dk</span>
                  </li>
                </ul>
              </div>
              <div className="card">
                <div className="badge">Onerilen Roller</div>
                {recommendedRoles.length ? (
                  <ul className="list">
                    {recommendedRoles.map((role, index) => (
                      <li key={`${role}-${index}`}>- {role}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Onerilen rol bulunamadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Bolum Ozeti</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Genel Bakis</div>
                <p className="helper" style={{ marginTop: '12px' }}>
                  {sections.overview || 'Bulunamadi.'}
                </p>
              </div>
              <div className="card">
                <div className="badge">Deneyim</div>
                <p className="helper" style={{ marginTop: '12px' }}>
                  {sections.experience || 'Bulunamadi.'}
                </p>
              </div>
              <div className="card">
                <div className="badge">Egitim</div>
                <p className="helper" style={{ marginTop: '12px' }}>
                  {sections.education || 'Bulunamadi.'}
                </p>
              </div>
              <div className="card">
                <div className="badge">Projeler</div>
                <p className="helper" style={{ marginTop: '12px' }}>
                  {sections.projects || 'Bulunamadi.'}
                </p>
              </div>
              <div className="card">
                <div className="badge">Sertifikalar</div>
                <p className="helper" style={{ marginTop: '12px' }}>
                  {sections.certifications || 'Bulunamadi.'}
                </p>
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Skill Analizi</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Teknik Skill&apos;ler</div>
                {safeArray(skills.technical).length ? (
                  <ul className="list">
                    {safeArray(skills.technical).map((skill, index) => (
                      <li key={`${skill}-${index}`}>- {skill}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Teknik skill bulunamadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Soft Skill&apos;ler</div>
                {safeArray(skills.soft).length ? (
                  <ul className="list">
                    {safeArray(skills.soft).map((skill, index) => (
                      <li key={`${skill}-${index}`}>- {skill}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Soft skill bulunamadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Eksik Skill&apos;ler</div>
                {hasMissingSkills ? (
                  <ul className="list">
                    {safeArray(skills.missing).map((skill, index) => (
                      <li key={`${skill}-${index}`}>- {skill}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Eksik skill listesi olusmadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Guc ve Gelisim</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Guclu Yanlar</div>
                {strengths.length ? (
                  <ul className="list">
                    {strengths.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Guclu yan bulunamadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Gelisim Alanlari</div>
                {weaknesses.length ? (
                  <ul className="list">
                    {weaknesses.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Gelisim alani bulunamadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Deneyim Ozetleri</div>
                {experienceHighlights.length ? (
                  <ul className="list">
                    {experienceHighlights.map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Deneyim ozeti bulunamadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Anahtar Kelime Analizi</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Mevcut Anahtar Kelimeler</div>
                {safeArray(keywords.present).length ? (
                  <ul className="list">
                    {safeArray(keywords.present).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Anahtar kelime bulunamadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Eksik Anahtar Kelimeler</div>
                {safeArray(keywords.missing).length ? (
                  <ul className="list">
                    {safeArray(keywords.missing).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Eksik anahtar kelime cikmadi.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Onerilen Anahtar Kelimeler</div>
                {safeArray(keywords.suggested).length ? (
                  <ul className="list">
                    {safeArray(keywords.suggested).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Oneri cikmadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>ATS Kontrolleri</h3>
            <div className="grid">
              <div className="card">
                <ul className="checklist">
                  {atsCheckItems.map((item) => {
                    const meta = statusMeta(item.value);
                    return (
                      <li key={item.key}>
                        <span>{item.label}</span>
                        <span className={`status ${meta.tone}`}>{meta.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="card">
                <div className="badge">Notlar</div>
                {safeArray(atsChecks.notes).length ? (
                  <ul className="list">
                    {safeArray(atsChecks.notes).map((note, index) => (
                      <li key={`${note}-${index}`}>- {note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Ek not bulunamadi.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="section-block">
            <h3>Risk ve Format</h3>
            <div className="grid">
              <div className="card">
                <div className="badge">Format Sorunlari</div>
                {safeArray(result.formatting_issues).length ? (
                  <ul className="list">
                    {safeArray(result.formatting_issues).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Belirgin format sorunu yok.
                  </p>
                )}
              </div>
              <div className="card">
                <div className="badge">Risk Bayraklari</div>
                {safeArray(result.risk_flags).length ? (
                  <ul className="list">
                    {safeArray(result.risk_flags).map((item, index) => (
                      <li key={`${item}-${index}`}>- {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="helper" style={{ marginTop: '12px' }}>
                    Kritik risk bulunamadi.
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className="footer">
            Not: Bu skor ve oneriler AI tarafindan uretilir. Nihai degerlendirmeyi insan gozuyle kontrol edin.
          </p>
        </section>
      )}

     
    </main>
  );
}
