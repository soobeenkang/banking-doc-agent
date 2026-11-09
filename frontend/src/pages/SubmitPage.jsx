import { useRef, useState } from 'react'
import { api } from '../api.js'
import { APP_STATUS, appStatus } from '../lib/format.js'
import { DOC_LABELS } from '../lib/fields.js'

const STEPS = ['파일 올리기', '서류 나누기', '항목 읽기', '서류 간 대조']
const MAX_MB = 30

export default function SubmitPage({ onOpen, onDone }) {
  const [file, setFile] = useState(null)
  const [over, setOver] = useState(false)
  const [step, setStep] = useState(-1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const input = useRef(null)
  const busy = step >= 0 && !result && !error

  function pick(f) {
    if (!f) return
    if (f.type !== 'application/pdf') return setError('PDF 파일만 올릴 수 있습니다. 서류를 PDF 하나로 묶어 주세요.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`${MAX_MB}MB 이하 파일만 올릴 수 있습니다.`)
    setError('')
    setResult(null)
    setStep(-1)
    setFile(f)
  }

  async function start() {
    setError('')
    setResult(null)
    try {
      const r = await api.submitApplication(file, setStep)
      setStep(STEPS.length)
      setResult(r)
      onDone?.()
    } catch (e) {
      setStep(-1)
      setError(e.message)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setStep(-1)
    setError('')
  }

  return (
    <main className="page page--narrow">
      <div className="page__head">
        <h1 className="page__title">서류 접수</h1>
        <p className="muted">신청자 한 명의 서류를 PDF 하나로 묶어 올리면, 서류를 종류별로 나누고 서로 맞는지 대조합니다.</p>
      </div>

      {!file ? (
        <div
          className={'drop' + (over ? ' is-over' : '')}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              input.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            pick(e.dataTransfer.files[0])
          }}
        >
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            hidden
            aria-label="접수할 PDF 파일 선택"
            onChange={(e) => {
              pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <span className="stack-thumb drop__thumb" aria-hidden="true">
            <i /><i /><b><em /><em /><em /></b>
          </span>
          <strong className="drop__title">PDF를 여기에 놓거나 눌러서 고르세요</strong>
          <p className="muted small">
            면허증, 등본, 대출신청서, 금융거래확인서, 소득금액증명원, 재직증명서를 한 파일에 담아 주세요. 최대 {MAX_MB}MB.
          </p>
        </div>
      ) : (
        <section className="card submit" aria-label="접수 진행">
          <div className="filerow">
            <span className="filerow__icon" aria-hidden="true">PDF</span>
            <span className="filerow__meta">
              <span className="strong break">{file.name}</span>
              <span className="muted small">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
            </span>
            {!busy && !result && (
              <button type="button" className="btn btn--outline btn--sm" onClick={reset}>
                다른 파일 고르기
              </button>
            )}
          </div>

          {step >= 0 && (
            <ol className="steps" aria-label="처리 단계">
              {STEPS.map((s, i) => (
                <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}>
                  <span className="steps__dot" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ol>
          )}

          {!result && (
            <div className="actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={start}>
                {busy ? '검토하는 중…' : '검토 시작'}
              </button>
            </div>
          )}

          {result && <ResultCard app={result} onOpen={() => onOpen(result.id)} onAgain={reset} />}
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
    </main>
  )
}

function ResultCard({ app, onOpen, onAgain }) {
  const status = appStatus(app)
  const st = APP_STATUS[status]
  return (
    <div className={`result result--${status}`} role="status">
      <div className="result__head">
        <span className={`pill pill--lg pill--${st.tone}`}>{st.label}</span>
        <span className="strong">{app.applicant_name ?? '신청자 확인 불가'}</span>
        <span className="muted small">{app.applicant_id}</span>
      </div>
      <p>{app.reason}</p>
      {app.reject_reasons?.length > 0 && (
        <ul className="bullets">
          {app.reject_reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <p className="muted small">찾은 서류: {(app.document_types ?? []).map((t) => DOC_LABELS[t] ?? t).join(', ') || '없음'}</p>
      <div className="actions">
        <button type="button" className="btn btn--outline" onClick={onAgain}>다른 서류 접수</button>
        <button type="button" className="btn btn--primary" onClick={onOpen}>신청 내역에서 보기</button>
      </div>
    </div>
  )
}
