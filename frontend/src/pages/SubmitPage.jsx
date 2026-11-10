import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { APP_STATUS, appStatus, cleanText, formatDateTime } from '../lib/format.js'
import { DOC_LABELS } from '../lib/fields.js'

const MAX_MB = 30
const POLL_MS = 3000
const STORE_KEY = 'submit.tasks'
const KEEP = 10 // 최근 접수 몇 건까지 기억할지

// 서버 task.status → 단계
const STEPS = ['접수', '서류 분석·대조', '결과 저장', '완료']
const STEP_OF = { queued: 0, running: 1, saving: 2, done: 4 }
const ACTIVE = new Set(['queued', 'running', 'saving'])

// ---------- 접수 목록 (브라우저에 저장해 새로고침 후에도 이어서 확인) ----------
function loadTasks() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function saveTasks(list) {
  try {
    // 화면 전용 값(app)은 빼고 저장한다. 결과는 다시 불러온다.
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, KEEP).map(({ app, ...t }) => t)))
  } catch {
    /* 저장 실패해도 화면은 동작 */
  }
}

export default function SubmitPage({ onOpen, onDone }) {
  const [file, setFile] = useState(null)
  const [over, setOver] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState(loadTasks)
  const input = useRef(null)
  const loading = useRef(new Set()) // 결과를 불러오는 중인 task_id

  useEffect(() => saveTasks(tasks), [tasks])

  const patch = (taskId, changes) =>
    setTasks((list) => list.map((t) => (t.task_id === taskId ? { ...t, ...changes } : t)))

  // 진행 중인 접수만 주기적으로 상태를 확인한다.
  const activeIds = tasks.filter((t) => ACTIVE.has(t.status)).map((t) => t.task_id).join(',')
  useEffect(() => {
    if (!activeIds) return
    let stopped = false
    async function poll() {
      for (const id of activeIds.split(',')) {
        try {
          const t = await api.getTask(id)
          if (stopped) return
          patch(id, { status: t.status, application_id: t.application_id, error: t.error })
          if (t.status === 'done') onDone?.()
        } catch (e) {
          if (stopped) return
          // 404: 서버가 재시작되어 처리 상태가 사라졌다
          if (e.status === 404) patch(id, { status: 'lost' })
        }
      }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [activeIds])

  // 끝난 접수는 판정 결과를 불러온다.
  useEffect(() => {
    tasks
      .filter((t) => t.status === 'done' && t.application_id && !t.app && !t.appError && !loading.current.has(t.task_id))
      .forEach((t) => {
        loading.current.add(t.task_id)
        api
          .getApplication(t.application_id)
          .then((app) => patch(t.task_id, { app }))
          .catch((e) => patch(t.task_id, { appError: e.message }))
          .finally(() => loading.current.delete(t.task_id))
      })
  }, [tasks])

  function pick(f) {
    if (!f) return
    if (f.type !== 'application/pdf') return setError('PDF 파일만 올릴 수 있습니다. 서류를 PDF 하나로 묶어 주세요.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`${MAX_MB}MB 이하 파일만 올릴 수 있습니다.`)
    setError('')
    setFile(f)
  }

  async function start() {
    setError('')
    setSending(true)
    try {
      const t = await api.submitApplication(file)
      setTasks((list) => [
        { task_id: t.task_id, file_name: t.file_name ?? file.name, size: file.size, status: t.status, submitted_at: new Date().toISOString() },
        ...list,
      ])
      setFile(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const remove = (taskId) => setTasks((list) => list.filter((t) => t.task_id !== taskId))

  return (
    <main className="page page--narrow page--scroll">
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
            신분증, 등본, 대출신청서, 금융거래확인서, 소득 서류, 재직증명서(사업자는 사업자등록증 등)를 한 파일에 담아 주세요. 최대 {MAX_MB}MB.
          </p>
        </div>
      ) : (
        <section className="card submit" aria-label="접수할 파일">
          <div className="filerow">
            <span className="filerow__icon" aria-hidden="true">PDF</span>
            <span className="filerow__meta">
              <span className="strong break">{file.name}</span>
              <span className="muted small">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
            </span>
            <button type="button" className="btn btn--outline btn--sm" disabled={sending} onClick={() => setFile(null)}>
              다른 파일 고르기
            </button>
          </div>
          <div className="actions">
            <button type="button" className="btn btn--primary" disabled={sending} onClick={start}>
              {sending ? '올리는 중…' : '접수하기'}
            </button>
          </div>
        </section>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {tasks.length > 0 && (
        <section className="tasks" aria-label="최근 접수">
          <h2 className="tasks__title">최근 접수</h2>
          {tasks.map((t) => (
            <TaskCard key={t.task_id} task={t} onOpen={onOpen} onRemove={() => remove(t.task_id)} />
          ))}
        </section>
      )}
    </main>
  )
}

function TaskCard({ task, onOpen, onRemove }) {
  const active = ACTIVE.has(task.status)
  const step = STEP_OF[task.status] ?? -1

  return (
    <article className="card submit" aria-busy={active}>
      <div className="filerow">
        <span className="filerow__icon" aria-hidden="true">PDF</span>
        <span className="filerow__meta">
          <span className="strong break">{task.file_name}</span>
          <span className="muted small">
            {formatDateTime(task.submitted_at)} 접수
            {task.size ? ` · ${(task.size / 1024 / 1024).toFixed(1)}MB` : ''}
          </span>
        </span>
        <TaskBadge status={task.status} />
        {!active && (
          <button type="button" className="btn btn--soft btn--sm" onClick={onRemove} aria-label={`${task.file_name} 목록에서 지우기`}>
            지우기
          </button>
        )}
      </div>

      {(active || task.status === 'done') && (
        <ol className="steps" aria-label="처리 단계">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="steps__dot" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ol>
      )}

      {active && (
        <p className="notice" role="status">
          접수되었습니다. 서류를 나누고 대조하는 데 시간이 걸립니다(약 1분 이상).
          이 화면을 떠나거나 새로고침해도 처리는 계속되며, 끝나면 여기와 신청 내역에 결과가 표시됩니다.
          <Elapsed since={task.submitted_at} />
        </p>
      )}

      {task.status === 'failed' && (
        <p className="notice notice--error" role="alert">
          처리하지 못했습니다. 파일을 확인한 뒤 다시 접수해 주세요.
          {task.error && <span className="block muted small break">{task.error.slice(0, 300)}</span>}
        </p>
      )}

      {task.status === 'lost' && (
        <p className="notice" role="status">
          서버가 다시 시작되어 처리 상태를 확인할 수 없습니다. 처리가 끝났다면 신청 내역에 있습니다.
        </p>
      )}

      {task.status === 'done' &&
        (task.app ? (
          <ResultCard app={task.app} onOpen={() => onOpen(task.app.id)} />
        ) : task.appError ? (
          <p className="notice notice--error">결과를 불러오지 못했습니다. {task.appError}</p>
        ) : (
          <p className="muted small">결과를 불러오는 중…</p>
        ))}
    </article>
  )
}

const BADGE = {
  queued: { label: '접수됨', tone: 'gray' },
  running: { label: '검토 중', tone: 'amber' },
  saving: { label: '저장 중', tone: 'amber' },
  done: { label: '완료', tone: 'green' },
  failed: { label: '실패', tone: 'red' },
  lost: { label: '확인 불가', tone: 'gray' },
}

function TaskBadge({ status }) {
  const b = BADGE[status] ?? { label: status, tone: 'gray' }
  return <span className={`pill pill--${b.tone}`}>{b.label}</span>
}

// 접수 후 경과 시간 (1초마다 갱신)
function Elapsed({ since }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const sec = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000))
  return <span className="block muted small">경과 {Math.floor(sec / 60)}분 {String(sec % 60).padStart(2, '0')}초</span>
}

function ResultCard({ app, onOpen }) {
  const status = appStatus(app)
  const st = APP_STATUS[status]
  return (
    <div className={`result result--${status}`}>
      <div className="result__head">
        <span className={`pill pill--lg pill--${st.tone}`}>{st.label}</span>
        <span className="strong">{app.applicant_name ?? '신청자 확인 불가'}</span>
        <span className="muted small">{app.applicant_id}</span>
      </div>
      <p>{cleanText(app.reason)}</p>
      {app.reject_reasons?.length > 0 && (
        <ul className="bullets">
          {app.reject_reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      <p className="muted small">찾은 서류: {(app.document_types ?? []).map((t) => DOC_LABELS[t] ?? t).join(', ') || '없음'}</p>
      <div className="actions">
        <button type="button" className="btn btn--primary" onClick={onOpen}>신청 내역에서 보기</button>
      </div>
    </div>
  )
}
