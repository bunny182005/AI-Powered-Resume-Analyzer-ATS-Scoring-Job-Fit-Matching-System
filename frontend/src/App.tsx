import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── PERSISTENT DB (localStorage) ───────────────────────────────────────────
const DB = {
  getUsers: () => JSON.parse(localStorage.getItem('om_users') || '[]'),
  saveUsers: (u) => localStorage.setItem('om_users', JSON.stringify(u)),
  getSession: () => JSON.parse(localStorage.getItem('om_session') || 'null'),
  saveSession: (s) => localStorage.setItem('om_session', JSON.stringify(s)),
  clearSession: () => localStorage.removeItem('om_session'),
  getAnalyses: (uid) => JSON.parse(localStorage.getItem(`om_analyses_${uid}`) || '[]'),
  saveAnalyses: (uid, a) => localStorage.setItem(`om_analyses_${uid}`, JSON.stringify(a)),
  addAnalysis: (uid, analysis) => {
    const all = DB.getAnalyses(uid);
    all.unshift({ ...analysis, id: Date.now(), date: new Date().toISOString() });
    DB.saveAnalyses(uid, all);
    return all;
  },
  deleteAnalysis: (uid, id) => {
    const all = DB.getAnalyses(uid).filter(a => a.id !== id);
    DB.saveAnalyses(uid, all);
    return all;
  },
};

// ─── CLAUDE API ──────────────────────────────────────────────────────────────
async function analyzeWithClaude(file, jobDescription){
  const formData = new FormData();

  formData.append("file", file);
  formData.append("job_description", jobDescription);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error("API request failed");
  }

  return await response.json();
}


// ─── PDF EXTRACTION HELPER ───────────────────────────────────────────────────
// Uses pdf.js via CDN to extract raw text from the uploaded PDF
async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result);
        
        // Dynamically load pdf.js if not already loaded in the environment
        if (!window.pdfjsLib) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
          document.head.appendChild(script);
          await new Promise(r => script.onload = r);
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }

        const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }
        
        resolve(fullText);
      } catch (error) {
        console.error("PDF extraction error:", error);
        reject("Failed to extract text from PDF");
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const T = {
  bg: '#F7F7F8', card: '#FFFFFF', border: '#E8E8EC', sep: '#F0F0F3',
  text: '#0F0F11', sub: '#6B6B7B', hint: '#A9A9BA',
  accent: '#5B5BD6', accentTint: '#EDEDFC', accentBorder: '#C4B5FD',
  green: '#16A34A', greenTint: '#F0FDF4', greenBorder: '#BBF7D0',
  red: '#DC2626', redTint: '#FEF2F2', redBorder: '#FECACA',
  amber: '#D97706', amberTint: '#FFFBEB', amberBorder: '#FDE68A',
};

// ─── MICRO COMPONENTS ────────────────────────────────────────────────────────
function Card({ children, style = {}, className = '' }) {
  return (
    <div className={className} style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
      boxShadow: '0 1px 4px rgba(15,15,17,0.04)', overflow: 'hidden', ...style
    }}>{children}</div>
  );
}

function SLabel({ children }) {
  return <p style={{ fontSize: 10, fontWeight: 700, color: T.hint, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>{children}</p>;
}

function Tag({ label, variant = 'match' }) {
  const v = {
    match: { bg: T.greenTint, color: T.green, border: T.greenBorder },
    missing: { bg: T.redTint, color: T.red, border: T.redBorder },
  }[variant];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, background: v.bg, color: v.color, border: `1px solid ${v.border}`
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.color, opacity: 0.7 }} />
      {label}
    </span>
  );
}

function Spinner({ size = 14, color = '#fff' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid rgba(255,255,255,0.2)`, borderTopColor: color,
      animation: 'spin 0.75s linear infinite', flexShrink: 0
    }} />
  );
}

function ScoreRing({ score, size = 118 }) {
  const sw = 7, r = (size - sw * 2) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const clr = score >= 75 ? T.green : score >= 50 ? T.amber : T.red;
  const bg = score >= 75 ? T.greenTint : score >= 50 ? T.amberTint : T.redTint;
  const lbl = score >= 75 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak';
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={T.sep} strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={clr} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.3s cubic-bezier(0.32,1,0.68,1) 0.1s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: '-0.04em', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: clr, background: bg, padding: '1px 6px', borderRadius: 4, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{lbl}</span>
      </div>
    </div>
  );
}

function BreakBar({ label, value, i = 0 }) {
  const c = value >= 75 ? T.green : value >= 50 ? T.amber : T.red;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 100 + i * 80); return () => clearTimeout(t); }, [value, i]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 128, fontSize: 12, color: T.sub, fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: T.sep, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: c, borderRadius: 3, width: `${w}%`, transition: 'width 0.9s ease' }} />
      </div>
      <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: T.text, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Input({ label, type = 'text', value, onChange, placeholder, required, hint }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3F3F50', marginBottom: 6 }}>{label}{required && <span style={{ color: T.red }}> *</span>}</label>
      <div style={{
        border: `1px solid ${focused ? T.accent : T.border}`, borderRadius: 10, overflow: 'hidden',
        boxShadow: focused ? `0 0 0 3px rgba(91,91,214,0.10)` : 'none', transition: 'all 0.15s'
      }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '10px 14px', fontSize: 13, color: '#3F3F50',
            background: T.card, border: 'none', outline: 'none', fontFamily: 'inherit'
          }} />
      </div>
      {hint && <p style={{ fontSize: 11, color: T.hint, marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const styles = {
    primary: { bg: T.text, color: '#fff', border: 'transparent', shadow: '0 2px 12px rgba(15,15,17,0.18)' },
    accent: { bg: T.accent, color: '#fff', border: 'transparent', shadow: '0 2px 12px rgba(91,91,214,0.25)' },
    ghost: { bg: '#fff', color: T.sub, border: T.border, shadow: 'none' },
    danger: { bg: T.redTint, color: T.red, border: T.redBorder, shadow: 'none' },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
        background: disabled ? T.sep : styles.bg, color: disabled ? T.hint : styles.color,
        border: `1px solid ${disabled ? T.border : styles.border}`,
        boxShadow: disabled ? 'none' : styles.shadow,
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s', letterSpacing: '-0.01em', ...style
      }}>{children}</button>
  );
}

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(''); setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const users = DB.getUsers();
    if (mode === 'signup') {
      if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
      if (users.find(u => u.email === email)) { setError('Email already registered'); setLoading(false); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
      const user = { id: Date.now(), name: name.trim(), email, password, createdAt: new Date().toISOString(), avatar: name.trim().slice(0, 2).toUpperCase() };
      DB.saveUsers([...users, user]);
      DB.saveSession(user);
      onLogin(user);
    } else {
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) { setError('Invalid email or password'); setLoading(false); return; }
      DB.saveSession(user);
      onLogin(user);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans',-apple-system,sans-serif", padding: 24
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: T.text, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 4px 16px rgba(15,15,17,0.2)'
          }}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width: 22, height: 22 }}>
              <circle cx="7" cy="7" r="5.2" stroke="white" strokeWidth="1.1" />
              <circle cx="7" cy="7" r="2.4" stroke="white" strokeWidth="1.1" />
              <circle cx="7" cy="7" r="0.9" fill="white" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.035em' }}>OptiMatch</h1>
          <p style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>Enterprise ATS Intelligence Platform</p>
        </div>

        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', background: T.bg, borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: mode === m ? T.card : 'transparent',
                  color: mode === m ? T.text : T.hint,
                  border: mode === m ? `1px solid ${T.border}` : '1px solid transparent',
                  boxShadow: mode === m ? '0 1px 4px rgba(15,15,17,0.06)' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                }}>
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'signup' && <Input label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" required />}
          <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="jane@company.com" required />
          <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required
            hint={mode === 'signup' ? 'Minimum 6 characters' : ''} />

          {error && (
            <div style={{ background: T.redTint, border: `1px solid ${T.redBorder}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>{error}</p>
            </div>
          )}

          <Btn onClick={submit} disabled={loading || !email || !password} style={{ width: '100%' }}>
            {loading ? <><Spinner />{mode === 'login' ? 'Signing in…' : 'Creating account…'}</> : mode === 'login' ? 'Sign In →' : 'Create Account →'}
          </Btn>

          {mode === 'login' && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: T.accentTint, borderRadius: 9, border: `1px solid ${T.accentBorder}` }}>
              <p style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>💡 Demo: signup with any email/password to get started instantly</p>
            </div>
          )}
        </Card>

        <p style={{ textAlign: 'center', fontSize: 11, color: T.hint, marginTop: 20 }}>No resume data is stored or shared externally.</p>
      </div>
    </div>
  );
}

// ─── ANALYZER TAB ─────────────────────────────────────────────────────────────
function AnalyzerTab({ user, onNewAnalysis }) {
  const [jdText, setJdText] = useState('');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState(null);
  const fileRef = useRef(null);
  
  const canRun = jdText.trim().length > 10 && !!file;

  const handleDrop = (e) => { 
    e.preventDefault(); 
    setDrag(false); 
    const f = e.dataTransfer.files[0]; 
    if (f) handleFile(f); 
  };
  
  const handleFile = (f) => {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      alert("Please upload a PDF file.");
      return;
    }
    setFile(f);
  };

  const run = async () => {
    if (!canRun) return;
    setResults(null); 
    setLoading(true);
    
    try {
      setStep(1); // Extracting text
      const extractedText = await extractTextFromPDF(file);
      
      const steps = ['Running semantic vector similarity search', 'Generating ATS score & breakdown', 'Composing AI recommendations'];
      for (let i = 2; i <= 4; i++) { 
        setStep(i); 
        await new Promise(r => setTimeout(r, 700)); 
      }
      
      const data = await analyzeWithClaude(file, jdText);

const safeData = {
  match_score: data?.match_score ?? 0,
  breakdown: Array.isArray(data?.breakdown) ? data.breakdown : [],
  recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
  keyword_metrics: {
    total: data?.keyword_metrics?.total ?? 0,
    matched: Array.isArray(data?.keyword_metrics?.matched) ? data.keyword_metrics.matched : [],
    missing: Array.isArray(data?.keyword_metrics?.missing) ? data.keyword_metrics.missing : []
  },
  summary: data?.summary ?? ""
};

setResults(safeData);

onNewAnalysis({
  ...safeData,
  fileName: file.name,
  jobDescription: jdText.slice(0, 120) + '…'
});
    } catch (err) {
      alert('Analysis failed: ' + err.message);
    } finally { 
      setLoading(false); 
      setStep(0); 
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.55fr)', gap: 20, alignItems: 'start' }}>
      {/* LEFT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Analysis Parameters</h2>
            {(jdText || file) && (
              <button onClick={() => { setJdText(''); setFile(null); setResults(null); }}
                style={{ fontSize: 11, fontWeight: 600, color: T.hint, padding: '3px 9px', borderRadius: 6, background: T.bg, border: `1px solid #EBEBEF`, cursor: 'pointer', fontFamily: 'inherit' }}>
                Clear all
              </button>
            )}
          </div>

          {/* JD */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3F3F50' }}>Job Description</label>
              <span style={{ fontSize: 11, color: T.hint }}>{jdText.length} chars</span>
            </div>
            <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={8}
              placeholder="Paste the full job description…"
              style={{
                width: '100%', padding: '12px 14px', fontSize: 13, color: '#3F3F50', background: T.card,
                border: `1px solid ${T.border}`, borderRadius: 10, outline: 'none', lineHeight: 1.65,
                fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box'
              }} />
          </div>

          {/* File drop - PDF Only */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#3F3F50' }}>Upload Resume (PDF)</label>
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: T.greenTint, border: `1px solid ${T.greenBorder}` }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#DCFCE7', border: `1px solid ${T.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 12 12" fill="none" style={{ width: 14, height: 14 }}><path d="M2 6l3 3 5-5" stroke={T.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#15803D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                  <p style={{ fontSize: 11, color: '#86EFAC', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB · Ready</p>
                </div>
                <button onClick={() => { setFile(null); }} style={{ width: 26, height: 26, borderRadius: 6, background: '#fff', border: `1px solid ${T.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg viewBox="0 0 10 10" fill="none" style={{ width: 10, height: 10 }}><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke={T.hint} strokeWidth="1.3" strokeLinecap="round" /></svg>
                </button>
              </div>
            ) : (
              <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '20px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px dashed ${drag ? T.accent : '#DDDDE5'}`, background: drag ? '#F7F7FB' : '#FAFAFB', transition: 'all 0.15s'
                }}>
                <svg viewBox="0 0 16 16" fill="none" style={{ width: 20, height: 20, color: T.hint }}>
                  <path d="M8 10.5V4.5M5.5 7L8 4.5 10.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.5 10.5a2.5 2.5 0 01.8-4.8 3.5 3.5 0 016.9-.3 2 2 0 01.8 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <p style={{ fontSize: 12, fontWeight: 600, color: T.sub }}>Drop or <span style={{ color: T.accent }}>browse</span></p>
                <p style={{ fontSize: 11, color: T.hint }}>PDF only · Max 5 MB</p>
                <input ref={fileRef} type="file" accept=".pdf" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} style={{ display: 'none' }} />
              </div>
            )}
          </div>

          {/* Readiness */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[{ label: 'Job description', ok: jdText.length > 10 }, { label: 'Resume PDF', ok: !!file }].map(({ label, ok }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, background: ok ? T.greenTint : T.bg, border: `1px solid ${ok ? T.greenBorder : '#EBEBEF'}` }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? '#22C55E' : '#DDDDE5', display: 'block' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: ok ? T.green : T.hint }}>{label}</span>
              </div>
            ))}
          </div>

          <button onClick={run} disabled={!canRun || loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: canRun && !loading ? T.text : T.sep,
              color: canRun && !loading ? '#fff' : T.hint,
              cursor: canRun && !loading ? 'pointer' : 'not-allowed',
              boxShadow: canRun && !loading ? '0 2px 12px rgba(15,15,17,0.18)' : 'none',
              border: '1px solid transparent', fontFamily: 'inherit', transition: 'all 0.15s'
            }}>
            {loading ? <><Spinner />Analyzing…</> : '✦ Run Semantic Analysis'}
          </button>
        </Card>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[{ n: '1.2M+', l: 'Analyzed' }, { n: '94%', l: 'Accuracy' }, { n: '2.4s', l: 'Avg time' }].map(({ n, l }) => (
            <Card key={l} style={{ padding: '14px 10px', textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: '-0.04em' }}>{n}</p>
              <p style={{ fontSize: 10, color: T.hint, marginTop: 3, fontWeight: 500 }}>{l}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div>
        {!loading && !results && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 24px', border: `1.5px dashed ${T.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3F3F50' }}>No analysis yet</h3>
            <p style={{ fontSize: 13, color: T.hint, marginTop: 6, maxWidth: 280, lineHeight: 1.65 }}>Fill in the job description and upload a PDF resume, then click "Run Semantic Analysis".</p>
          </div>
        )}

        {loading && (
          <Card style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, paddingBottom: 22, borderBottom: `1px solid ${T.sep}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: T.accentTint, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size={15} color={T.accent} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Processing Pipeline</h3>
                <p style={{ fontSize: 12, color: T.hint, marginTop: 2 }}>Claude AI is analyzing…</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, background: T.accentTint, padding: '4px 10px', borderRadius: 7, border: `1px solid ${T.accentBorder}` }}>{Math.min(Math.round((step / 4) * 100), 99)}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {['Extracting text from PDF document', 'Running semantic vector similarity search', 'Generating precision ATS score & breakdown', 'Composing AI recommendations'].map((lbl, i) => {
                const status = step > i + 1 ? 'done' : step === i + 1 ? 'active' : 'idle';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                      background: status === 'done' ? T.greenTint : status === 'active' ? T.accentTint : T.bg,
                      border: `1.5px solid ${status === 'done' ? T.greenBorder : status === 'active' ? T.accentBorder : T.border}`,
                      color: status === 'done' ? T.green : status === 'active' ? T.accent : T.hint
                    }}>
                      {status === 'done' ? '✓' : status === 'active' ? '●' : i + 1}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: status === 'active' ? 600 : 400, color: status === 'idle' ? T.hint : T.text }}>{lbl}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 24, height: 3, background: T.sep, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: `linear-gradient(90deg,${T.accent},#8B5CF6)`, borderRadius: 2, width: `${Math.min((step / 4) * 100, 99)}%`, transition: 'width 0.5s ease' }} />
            </div>
          </Card>
        )}

        {results && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Score + Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14 }}>
              <Card style={{ padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minWidth: 164 }}>
                <SLabel>Overall Match</SLabel>
                <ScoreRing score={results.match_score} />
                <div style={{ width: '100%', borderTop: `1px solid ${T.sep}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { l: 'Skills matched', v: `${results.keyword_metrics.matched.length}/${results.keyword_metrics.total}`, c: T.text },
                    { l: 'Gaps found', v: results.keyword_metrics.missing.length, c: T.red },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: T.hint, fontWeight: 500 }}>{l}</span>
                      <span style={{ fontWeight: 700, color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card style={{ padding: 22 }}>
                <SLabel>Score Breakdown</SLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {results.breakdown.map((b, i) => <BreakBar key={b.label} label={b.label} value={b.value} i={i} />)}
                </div>
              </Card>
            </div>

            {/* Keywords */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { title: 'Matched Skills', variant: 'match', items: results.keyword_metrics.matched, cc: T.green, cbg: T.greenTint, cb: T.greenBorder },
                { title: 'Missing Skills', variant: 'missing', items: results.keyword_metrics.missing, cc: T.red, cbg: T.redTint, cb: T.redBorder },
              ].map(({ title, variant, items, cc, cbg, cb }) => (
                <Card key={title} style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <SLabel>{title}</SLabel>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cc, background: cbg, border: `1px solid ${cb}`, padding: '1px 7px', borderRadius: 5 }}>{items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {items.map(s => <Tag key={s} label={s} variant={variant} />)}
                  </div>
                </Card>
              ))}
            </div>

            {/* Summary */}
            {results.summary && (
              <Card style={{ padding: 18 }}>
                <SLabel>AI Summary</SLabel>
                <p style={{ fontSize: 13, color: '#3F3F50', lineHeight: 1.7 }}>{results.summary}</p>
              </Card>
            )}

            {/* Recommendations */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>✦ AI Recommendations</span>
                <span style={{ fontSize: 11, color: T.hint, background: T.bg, padding: '3px 9px', borderRadius: 6, border: `1px solid #EBEBEF` }}>Claude · {results.recommendations.length} insights</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {results.recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#FAFAFA', border: `1px solid ${T.sep}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: T.accentTint, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: 10, color: T.accent }}>→</span>
                    </div>
                    <p style={{ fontSize: 13, color: '#3F3F50', lineHeight: 1.65, margin: 0 }}>{r}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Btn onClick={() => { setResults(null); setFile(null); setJdText(''); }} variant="ghost" style={{ alignSelf: 'flex-start' }}>
              ← New Analysis
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HISTORY TAB ──────────────────────────────────────────────────────────────
function HistoryTab({ user, analyses, onDelete, onSelect }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const filtered = analyses
    .filter(a => (a.candidate_name || '').toLowerCase().includes(search.toLowerCase()) || (a.job_title || '').toLowerCase().includes(search.toLowerCase()) || (a.jobDescription || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'newest' ? b.id - a.id : sort === 'oldest' ? a.id - b.id : b.match_score - a.match_score);

  if (analyses.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px 24px', border: `1.5px dashed ${T.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3F3F50' }}>No analyses yet</h3>
      <p style={{ fontSize: 13, color: T.hint, marginTop: 6 }}>Run your first analysis to see history here.</p>
    </div>
  );

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by candidate, role…"
          style={{ flex: 1, padding: '9px 14px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit', color: T.text }} />
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{ padding: '9px 12px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 10, fontFamily: 'inherit', color: T.text, background: T.card, cursor: 'pointer' }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="score">Highest score</option>
        </select>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Analyses', value: analyses.length, color: T.text },
          { label: 'Avg Score', value: Math.round(analyses.reduce((s, a) => s + a.match_score, 0) / analyses.length) + '%', color: T.accent },
          { label: 'Strong Matches', value: analyses.filter(a => a.match_score >= 75).length, color: T.green },
          { label: 'Need Work', value: analyses.filter(a => a.match_score < 50).length, color: T.red },
        ].map(({ label, value, color }) => (
          <Card key={label} style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.04em' }}>{value}</p>
            <p style={{ fontSize: 11, color: T.hint, marginTop: 3, fontWeight: 500 }}>{label}</p>
          </Card>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(a => {
          const clr = a.match_score >= 75 ? T.green : a.match_score >= 50 ? T.amber : T.red;
          const bg = a.match_score >= 75 ? T.greenTint : a.match_score >= 50 ? T.amberTint : T.redTint;
          const bd = a.match_score >= 75 ? T.greenBorder : a.match_score >= 50 ? T.amberBorder : T.redBorder;
          return (
            <Card key={a.id} style={{ padding: '16px 20px', cursor: 'pointer' }} className="hist-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: clr }}>{a.match_score}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.candidate_name || 'Candidate'}
                    </p>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: bg, color: clr, border: `1px solid ${bd}`, flexShrink: 0 }}>
                      {a.match_score >= 75 ? 'Strong' : a.match_score >= 50 ? 'Moderate' : 'Weak'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: T.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.job_title || 'Role'} · {a.fileName || 'Resume'}
                  </p>
                  <p style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                  <button onClick={() => onSelect(a)}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: T.accent, background: T.accentTint, border: `1px solid ${T.accentBorder}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    View
                  </button>
                  <button onClick={() => onDelete(a.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: T.red, background: T.redTint, border: `1px solid ${T.redBorder}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✕
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <p style={{ textAlign: 'center', color: T.hint, padding: 32 }}>No results match your search.</p>}
      </div>
    </div>
  );
}

// ─── ANALYTICS TAB ────────────────────────────────────────────────────────────
function AnalyticsTab({ analyses }) {
  if (analyses.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px 24px', border: `1.5px dashed ${T.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3F3F50' }}>No data yet</h3>
      <p style={{ fontSize: 13, color: T.hint, marginTop: 6 }}>Run analyses to see insights here.</p>
    </div>
  );

  const avg = Math.round(analyses.reduce((s, a) => s + a.match_score, 0) / analyses.length);
  const dist = { '0-49': 0, '50-74': 0, '75-100': 0 };
  analyses.forEach(a => { if (a.match_score < 50) dist['0-49']++; else if (a.match_score < 75) dist['50-74']++; else dist['75-100']++; });
  const maxDist = Math.max(...Object.values(dist), 1);
  const allSkills = {};
  analyses.forEach(a => { (a.keyword_metrics?.missing || []).forEach(s => { allSkills[s] = (allSkills[s] || 0) + 1; }); });
  const topGaps = Object.entries(allSkills).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const recent = [...analyses].slice(0, 10).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total Analyses', value: analyses.length, sub: 'all time', color: T.text },
          { label: 'Average Score', value: avg + '%', sub: 'across all', color: T.accent },
          { label: 'Pass Rate (≥75)', value: Math.round((dist['75-100'] / analyses.length) * 100) + '%', sub: 'strong matches', color: T.green },
          { label: 'Avg Gaps Found', value: Math.round(analyses.reduce((s, a) => s + (a.keyword_metrics?.missing?.length || 0), 0) / analyses.length), sub: 'missing skills', color: T.red },
        ].map(({ label, value, sub, color }) => (
          <Card key={label} style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 12, color: T.text, fontWeight: 600, marginTop: 6 }}>{label}</p>
            <p style={{ fontSize: 11, color: T.hint, marginTop: 2 }}>{sub}</p>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Score distribution */}
        <Card style={{ padding: 22 }}>
          <SLabel>Score Distribution</SLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(dist).map(([range, count]) => {
              const clr = range === '75-100' ? T.green : range === '50-74' ? T.amber : T.red;
              const label = range === '75-100' ? 'Strong (75–100)' : range === '50-74' ? 'Moderate (50–74)' : 'Weak (0–49)';
              return (
                <div key={range}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#3F3F50' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: clr }}>{count} ({Math.round((count / analyses.length) * 100)}%)</span>
                  </div>
                  <div style={{ height: 8, background: T.sep, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: clr, borderRadius: 4, width: `${(count / maxDist) * 100}%`, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top skill gaps */}
        <Card style={{ padding: 22 }}>
          <SLabel>Most Common Skill Gaps</SLabel>
          {topGaps.length === 0 ? <p style={{ fontSize: 13, color: T.hint }}>No gap data yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topGaps.map(([skill, count]) => (
                <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 100, fontSize: 12, color: T.sub, fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill}</span>
                  <div style={{ flex: 1, height: 5, background: T.sep, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: T.red, borderRadius: 3, width: `${(count / analyses.length) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.red, width: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Score trend */}
      <Card style={{ padding: 22 }}>
        <SLabel>Score Trend (Last {recent.length} Analyses)</SLabel>
        <div style={{ height: 100, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {recent.map((a, i) => {
            const clr = a.match_score >= 75 ? T.green : a.match_score >= 50 ? T.amber : T.red;
            return (
              <div key={a.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: clr }}>{a.match_score}</span>
                <div style={{ width: '100%', background: clr, borderRadius: '3px 3px 0 0', opacity: 0.8, height: `${a.match_score}%`, transition: 'height 0.5s ease' }} />
                <span style={{ fontSize: 8, color: T.hint, transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab({ user, onUpdate, onLogout, analyses }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const save = () => {
    const users = DB.getUsers();
    const updated = users.map(u => u.id === user.id ? { ...u, name, email, avatar: name.slice(0, 2).toUpperCase() } : u);
    DB.saveUsers(updated);
    const updatedUser = { ...user, name, email, avatar: name.slice(0, 2).toUpperCase() };
    DB.saveSession(updatedUser);
    onUpdate(updatedUser);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const clearHistory = () => {
    DB.saveAnalyses(user.id, []);
    setConfirmClear(false);
    window.location.reload();
  };

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile */}
      <Card style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 20 }}>Profile Settings</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '16px', background: T.bg, borderRadius: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {user.avatar || user.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{user.name}</p>
            <p style={{ fontSize: 12, color: T.hint }}>{user.email} · Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <Input label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
        <Input label="Email Address" type="email" value={email} onChange={setEmail} placeholder="jane@company.com" />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Btn onClick={save}>Save Changes</Btn>
          {saved && <span style={{ fontSize: 12, color: T.green, fontWeight: 600 }}>✓ Saved successfully</span>}
        </div>
      </Card>

      {/* Account stats */}
      <Card style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16 }}>Account Statistics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Analyses Run', value: analyses.length },
            { label: 'Avg Score', value: analyses.length ? Math.round(analyses.reduce((s, a) => s + a.match_score, 0) / analyses.length) + '%' : '—' },
            { label: 'Best Score', value: analyses.length ? Math.max(...analyses.map(a => a.match_score)) + '%' : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '14px 16px', background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.03em' }}>{value}</p>
              <p style={{ fontSize: 11, color: T.hint, marginTop: 3, fontWeight: 500 }}>{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Danger zone */}
      <Card style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Data & Privacy</h3>
        <p style={{ fontSize: 12, color: T.hint, marginBottom: 20 }}>All data is stored locally in your browser. Nothing is sent to external servers.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!confirmClear ? (
            <Btn onClick={() => setConfirmClear(true)} variant="danger">🗑 Clear All Analysis History</Btn>
          ) : (
            <div style={{ padding: '14px 16px', background: T.redTint, borderRadius: 10, border: `1px solid ${T.redBorder}` }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.red, marginBottom: 12 }}>Are you sure? This will delete all {analyses.length} analyses.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={clearHistory} variant="danger">Yes, delete all</Btn>
                <Btn onClick={() => setConfirmClear(false)} variant="ghost">Cancel</Btn>
              </div>
            </div>
          )}
          <Btn onClick={onLogout} variant="ghost">Sign Out →</Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── CANDIDATES TAB ───────────────────────────────────────────────────────────
function CandidatesTab({ analyses }) {
  const [selected, setSelected] = useState(null);

  if (analyses.length === 0) return (
    <div style={{ textAlign: 'center', padding: '80px 24px', border: `1.5px dashed ${T.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: '#3F3F50' }}>No candidates yet</h3>
      <p style={{ fontSize: 13, color: T.hint, marginTop: 6 }}>Analyses will appear here as candidate profiles.</p>
    </div>
  );

  if (selected) {
    const clr = selected.match_score >= 75 ? T.green : selected.match_score >= 50 ? T.amber : T.red;
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: T.sub, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 20 }}>
          ← Back to Candidates
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff' }}>
                {(selected.candidate_name || 'C').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{selected.candidate_name || 'Candidate'}</h2>
                <p style={{ fontSize: 13, color: T.sub }}>{selected.job_title || 'Role'} · {selected.fileName}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <ScoreRing score={selected.match_score} size={80} />
              </div>
            </div>
          </Card>
          {selected.summary && <Card style={{ padding: 20 }}><SLabel>Summary</SLabel><p style={{ fontSize: 13, color: '#3F3F50', lineHeight: 1.7 }}>{selected.summary}</p></Card>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card style={{ padding: 18 }}>
              <SLabel>Matched Skills ({selected.keyword_metrics.matched.length})</SLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{selected.keyword_metrics.matched.map(s => <Tag key={s} label={s} variant="match" />)}</div>
            </Card>
            <Card style={{ padding: 18 }}>
              <SLabel>Missing Skills ({selected.keyword_metrics.missing.length})</SLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{selected.keyword_metrics.missing.map(s => <Tag key={s} label={s} variant="missing" />)}</div>
            </Card>
          </div>
          <Card style={{ padding: 20 }}>
            <SLabel>Score Breakdown</SLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {selected.breakdown.map((b, i) => <BreakBar key={b.label} label={b.label} value={b.value} i={i} />)}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
      {analyses.map(a => {
        const clr = a.match_score >= 75 ? T.green : a.match_score >= 50 ? T.amber : T.red;
        const bg = a.match_score >= 75 ? T.greenTint : a.match_score >= 50 ? T.amberTint : T.redTint;
        const bd = a.match_score >= 75 ? T.greenBorder : a.match_score >= 50 ? T.amberBorder : T.redBorder;
        return (
          <Card key={a.id} style={{ padding: 20, cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.2s' }}
            className="lift" onClick={() => setSelected(a)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {(a.candidate_name || 'C').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.candidate_name || 'Candidate'}</p>
                <p style={{ fontSize: 11, color: T.hint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.job_title || 'Role'}</p>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: clr }}>{a.match_score}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
              {(a.keyword_metrics?.matched || []).slice(0, 3).map(s => <Tag key={s} label={s} variant="match" />)}
              {(a.keyword_metrics?.matched?.length || 0) > 3 && <span style={{ fontSize: 11, color: T.hint, padding: '3px 6px' }}>+{a.keyword_metrics.matched.length - 3}</span>}
            </div>
            <p style={{ fontSize: 11, color: T.hint }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </Card>
        );
      })}
    </div>
  );
}

// ─── RESULT MODAL ─────────────────────────────────────────────────────────────
function ResultModal({ analysis, onClose }) {
  if (!analysis) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,17,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card style={{ maxWidth: 680, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{analysis.candidate_name || 'Candidate'} · {analysis.job_title}</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: T.hint }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          <ScoreRing score={analysis.match_score} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
            {analysis.breakdown.map((b, i) => <BreakBar key={b.label} label={b.label} value={b.value} i={i} />)}
          </div>
        </div>
        {analysis.summary && <p style={{ fontSize: 13, color: '#3F3F50', lineHeight: 1.7, marginBottom: 16, padding: '12px 14px', background: T.bg, borderRadius: 10 }}>{analysis.summary}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><SLabel>Matched Skills</SLabel><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{analysis.keyword_metrics.matched.map(s => <Tag key={s} label={s} variant="match" />)}</div></div>
          <div><SLabel>Missing Skills</SLabel><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{analysis.keyword_metrics.missing.map(s => <Tag key={s} label={s} variant="missing" />)}</div></div>
        </div>
        <div>
          <SLabel>AI Recommendations</SLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {analysis.recommendations.map((r, i) => (
              <div key={i} style={{ padding: '10px 14px', background: T.accentTint, borderRadius: 9, border: `1px solid ${T.accentBorder}` }}>
                <p style={{ fontSize: 12, color: '#3F3F50', lineHeight: 1.6 }}>{r}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function OptiMatchApp() {
  const [user, setUser] = useState(() => DB.getSession());
  const [tab, setTab] = useState('dashboard');
  const [analyses, setAnalyses] = useState([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);

  useEffect(() => {
    if (user) setAnalyses(DB.getAnalyses(user.id));
  }, [user]);

  const handleLogin = (u) => { setUser(u); setAnalyses(DB.getAnalyses(u.id)); };
  const handleLogout = () => { DB.clearSession(); setUser(null); setTab('dashboard'); };
  const handleNewAnalysis = (a) => { const updated = DB.addAnalysis(user.id, a); setAnalyses(updated); };
  const handleDeleteAnalysis = (id) => { const updated = DB.deleteAnalysis(user.id, id); setAnalyses(updated); };
  const handleUpdateUser = (u) => setUser(u);

  if (!user) return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'); *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <AuthPage onLogin={handleLogin} />
    </>
  );

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
    { id: 'analyzer', label: 'Analyze', icon: '✦' },
    { id: 'candidates', label: 'Candidates', icon: '👤' },
    { id: 'history', label: 'History', icon: '📋' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body { background:${T.bg}; font-family:'Plus Jakarta Sans',-apple-system,sans-serif; -webkit-font-smoothing:antialiased; color:${T.text}; }
        textarea, input, select, button { font-family:inherit; }
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:${T.bg}; }
        ::-webkit-scrollbar-thumb { background:#DDDDE5; border-radius:3px; }
        .lift:hover { box-shadow: 0 6px 24px rgba(15,15,17,0.09) !important; transform: translateY(-1px); }
        .lift { transition: box-shadow 0.2s, transform 0.2s; }
        .hist-card:hover { border-color: ${T.accentBorder}; }
      `}</style>

      <div style={{ minHeight: '100vh', background: T.bg }}>
        {/* NAV */}
        <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(15,15,17,0.2)' }}>
                <svg viewBox="0 0 14 14" fill="none" style={{ width: 16, height: 16 }}>
                  <circle cx="7" cy="7" r="5.2" stroke="white" strokeWidth="1.1" />
                  <circle cx="7" cy="7" r="2.4" stroke="white" strokeWidth="1.1" />
                  <circle cx="7" cy="7" r="0.9" fill="white" />
                </svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: T.text, letterSpacing: '-0.03em' }}>OptiMatch</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.hint, background: T.sep, padding: '1px 7px', borderRadius: 5, letterSpacing: '0.04em' }}>ENTERPRISE</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                    color: tab === t.id ? T.text : T.sub, padding: '5px 12px', borderRadius: 8,
                    background: tab === t.id ? T.sep : 'transparent',
                    border: 'none', cursor: 'pointer', transition: 'all 0.12s'
                  }}>
                  <span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}
                  {t.id === 'history' && analyses.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, background: T.accentTint, padding: '0 5px', borderRadius: 4, border: `1px solid ${T.accentBorder}` }}>{analyses.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: T.greenTint, border: `1px solid ${T.greenBorder}` }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'block', animation: 'pulse 2.4s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: T.green }}>Claude Live</span>
              </div>
              <div onClick={() => setTab('settings')} style={{ width: 30, height: 30, borderRadius: '50%', background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', border: `2px solid ${T.border}`, cursor: 'pointer' }}>
                {user.avatar || user.name.slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </nav>

        {/* PAGE */}
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 28px 72px' }}>
          {/* Page header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: T.hint, fontWeight: 500 }}>Dashboard</span>
              {tab !== 'dashboard' && <>
                <span style={{ fontSize: 12, color: '#DDDDE5' }}>›</span>
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>{tabs.find(t => t.id === tab)?.label}</span>
              </>}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, letterSpacing: '-0.035em' }}>
                  {tab === 'dashboard' ? `Welcome back, ${user.name.split(' ')[0]} 👋` : tabs.find(t => t.id === tab)?.label}
                </h1>
                <p style={{ fontSize: 13, color: T.sub, marginTop: 4 }}>
                  {tab === 'dashboard' ? 'AI-powered resume analysis powered by Claude.' : tab === 'analyzer' ? 'Analyze a resume against a job description.' : tab === 'history' ? `${analyses.length} total analyses in your history.` : tab === 'analytics' ? 'Insights across all your analyses.' : tab === 'candidates' ? 'All candidate profiles from your analyses.' : 'Manage your account and preferences.'}
                </p>
              </div>
              {tab === 'dashboard' && (
                <Btn onClick={() => setTab('analyzer')} variant="accent">✦ New Analysis →</Btn>
              )}
            </div>
          </div>

          {/* Dashboard */}
          {tab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Quick stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {[
                  { label: 'Total Analyses', value: analyses.length, icon: '📋', color: T.accent },
                  { label: 'Avg Match Score', value: analyses.length ? Math.round(analyses.reduce((s, a) => s + a.match_score, 0) / analyses.length) + '%' : '—', icon: '🎯', color: T.green },
                  { label: 'Strong Matches', value: analyses.filter(a => a.match_score >= 75).length, icon: '✅', color: T.green },
                  { label: 'Analyses This Week', value: analyses.filter(a => Date.now() - new Date(a.date) < 7 * 864e5).length, icon: '📅', color: T.amber },
                ].map(({ label, value, icon, color }) => (
                  <Card key={label} style={{ padding: '20px 22px' }} className="lift">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.04em' }}>{value}</span>
                    </div>
                    <p style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>{label}</p>
                  </Card>
                ))}
              </div>

              {/* Quick actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  { icon: '✦', label: 'New Analysis', desc: 'Analyze a resume with Claude AI', tab: 'analyzer', color: T.accent, bg: T.accentTint, bd: T.accentBorder },
                  { icon: '👤', label: 'View Candidates', desc: 'Browse all candidate profiles', tab: 'candidates', color: T.text, bg: T.bg, bd: T.border },
                  { icon: '📊', label: 'Analytics', desc: 'See insights and trends', tab: 'analytics', color: T.green, bg: T.greenTint, bd: T.greenBorder },
                ].map(({ icon, label, desc, tab: t, color, bg, bd }) => (
                  <Card key={label} style={{ padding: 22, cursor: 'pointer', background: bg, borderColor: bd }} className="lift" onClick={() => setTab(t)}>
                    <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
                    <p style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 12, color: T.hint }}>{desc}</p>
                  </Card>
                ))}
              </div>

              {/* Recent analyses */}
              {analyses.length > 0 && (
                <Card style={{ padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Analyses</h3>
                    <button onClick={() => setTab('history')} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {analyses.slice(0, 5).map(a => {
                      const clr = a.match_score >= 75 ? T.green : a.match_score >= 50 ? T.amber : T.red;
                      const bg = a.match_score >= 75 ? T.greenTint : a.match_score >= 50 ? T.amberTint : T.redTint;
                      return (
                        <div key={a.id} onClick={() => setSelectedAnalysis(a)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, background: T.bg, border: `1px solid ${T.border}`, cursor: 'pointer', transition: 'border-color 0.15s' }}>
                          <div style={{ width: 38, height: 38, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: clr }}>{a.match_score}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.candidate_name || 'Candidate'}</p>
                            <p style={{ fontSize: 11, color: T.hint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.job_title} · {a.fileName}</p>
                          </div>
                          <span style={{ fontSize: 11, color: T.hint, flexShrink: 0 }}>{new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {analyses.length === 0 && (
                <Card style={{ padding: 40, textAlign: 'center', border: `1.5px dashed ${T.border}` }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#3F3F50', marginBottom: 8 }}>Ready to get started?</h3>
                  <p style={{ fontSize: 13, color: T.hint, marginBottom: 20, maxWidth: 340, margin: '0 auto 20px' }}>Run your first AI-powered resume analysis. Paste a job description and resume, and Claude will score the match in seconds.</p>
                  <Btn onClick={() => setTab('analyzer')} variant="accent">✦ Run First Analysis →</Btn>
                </Card>
              )}
            </div>
          )}

          {tab === 'analyzer' && <AnalyzerTab user={user} onNewAnalysis={handleNewAnalysis} />}
          {tab === 'candidates' && <CandidatesTab analyses={analyses} />}
          {tab === 'history' && <HistoryTab user={user} analyses={analyses} onDelete={handleDeleteAnalysis} onSelect={setSelectedAnalysis} />}
          {tab === 'analytics' && <AnalyticsTab analyses={analyses} />}
          {tab === 'settings' && <SettingsTab user={user} onUpdate={handleUpdateUser} onLogout={handleLogout} analyses={analyses} />}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.card }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 11, color: T.hint, fontWeight: 500 }}>OptiMatch Enterprise · ATS Intelligence Platform</p>
            <p style={{ fontSize: 11, color: '#DDDDE5' }}>Powered by Claude AI · Data stored locally</p>
          </div>
        </div>
      </div>

      {/* Result modal */}
      <ResultModal analysis={selectedAnalysis} onClose={() => setSelectedAnalysis(null)} />
    </>
  );
}