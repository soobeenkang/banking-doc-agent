import { useRef, useState } from 'react';
import { submitApplication } from '../api.js';
import { appState, StateTag } from '../components/ui.jsx';
import { DOC_LABELS } from '../lib/fields.js';

const STEPS = ['파일 올리기', '서류 나누기', '항목 읽기', '서류 간 대조'];
const MAX_MB = 30;

export default function SubmitPage({ onOpen }) {
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const input = useRef(null);
  const busy = step >= 0 && !result;

  const pick = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') return setError('PDF 파일만 올릴 수 있습니다. 서류를 PDF 하나로 묶어 주세요.');
    if (f.size > MAX_MB * 1024 * 1024) return setError(`${MAX_MB}MB 이하 파일만 올릴 수 있습니다.`);
    setError('');
    setResult(null);
    setStep(-1);
    setFile(f);
  };

  const start = async () => {
    setResult(null);
    const r = await submitApplication(file, setStep);
    setStep(STEPS.length);
    setResult(r);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setStep(-1);
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>서류 접수</h1>
        <p>신청자 한 명의 서류를 PDF 하나로 묶어 올리면, 서류를 종류별로 나누고 서로 맞는지 대조합니다.</p>
      </header>

      {!file ? (
        <div
          className={`drop ${over ? 'over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files[0]);
          }}
        >
          <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => pick(e.target.files[0])} />
          <div className="drop-stack" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <strong>PDF를 여기에 놓거나 눌러서 고르세요</strong>
          <p>면허증, 등본, 대출신청서, 금융거래확인서, 소득금액증명원, 재직증명서를 한 파일에 담아 주세요. 최대 {MAX_MB}MB.</p>
        </div>
      ) : (
        <section className="panel">
          <div className="file-row">
            <div className="file-icon" aria-hidden="true">PDF</div>
            <div className="file-meta">
              <strong>{file.name}</strong>
              <span>{(file.size / 1024 / 1024).toFixed(1)}MB</span>
            </div>
            {!busy && !result && (
              <button className="btn ghost" onClick={reset}>
                다른 파일 고르기
              </button>
            )}
          </div>

          {step >= 0 && (
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
                  <span className="dot" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ol>
          )}

          {!result && (
            <div className="panel-actions">
              <button className="btn primary" disabled={busy} onClick={start}>
                {busy ? '검토하는 중' : '검토 시작'}
              </button>
            </div>
          )}

          {result && <ResultCard app={result} onOpen={() => onOpen(result.id)} onAgain={reset} />}
        </section>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function ResultCard({ app, onOpen, onAgain }) {
  const s = appState(app);
  return (
    <div className={`result result-${s.key}`}>
      <div className="result-head">
        <StateTag state={s.key}>{s.label}</StateTag>
        <strong>{app.applicant_name ?? '신청자 확인 불가'}</strong>
        <span className="num">{app.applicant_id}</span>
      </div>
      <p>{app.reason}</p>
      {app.reject_reasons.length > 0 && (
        <ul className="reasons">
          {app.reject_reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="muted small">찾은 서류: {app.document_types.map((t) => DOC_LABELS[t] ?? t).join(', ')}</p>
      <div className="panel-actions">
        <button className="btn ghost" onClick={onAgain}>
          다른 서류 접수
        </button>
        <button className="btn primary" onClick={onOpen}>
          신청 내역에서 보기
        </button>
      </div>
    </div>
  );
}
