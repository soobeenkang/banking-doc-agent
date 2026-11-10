import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import UploadButton from '../components/UploadButton.jsx'
import { APP_STATUS, appStatus, failedChecks, formatDateTime, formatShortDateTime, SENS_COLOR } from '../lib/format.js'
import { APPLICANT_TYPES, DOC_LABELS, fieldLabel, formatValue, isHashed, lookupField, maskValue } from '../lib/fields.js'

const TABS = [
  { id: 'ALL', label: '전체' },
  { id: 'PASS', label: '통과' },
  { id: 'REVIEW', label: '검토 필요' },
  { id: 'MISSING', label: '서류 누락' },
]

const RING = { PASS: '#04764C', REVIEW: '#A0501A', MISSING: '#B22E3B' }

export default function ApplicationsPage({ focusId, onSubmit }) {
  const [apps, setApps] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('ALL')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(focusId)

  useEffect(() => {
    api
      .getApplications()
      .then((list) => {
        setApps(list)
        setSelectedId((cur) => focusId ?? cur ?? list[0]?.id ?? null)
      })
      .catch((e) => setError(e.message))
  }, [focusId])

  const counts = useMemo(() => {
    const c = { ALL: 0, PASS: 0, REVIEW: 0, MISSING: 0 }
    ;(apps ?? []).forEach((a) => {
      c.ALL += 1
      c[appStatus(a)] += 1
    })
    return c
  }, [apps])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (apps ?? []).filter((a) => {
      if (tab !== 'ALL' && appStatus(a) !== tab) return false
      if (!q) return true
      return `${a.applicant_name ?? ''} ${a.applicant_id ?? ''} ${a.source_file_name}`.toLowerCase().includes(q)
    })
  }, [apps, tab, query])

  const selected = apps?.find((a) => a.id === selectedId)

  return (
    <main className="page page--apps">
      <div className="page__head">
        <h1 className="page__title">신청 내역</h1>
        <p className="muted">
          접수된 모든 신청을 보관합니다. 통과한 건만 서류와 추출값이 저장되고, 나머지는 사유만 남습니다.
          주민등록번호·면허번호는 해시로 저장되어 가린 값만 표시합니다.
        </p>
      </div>

      <div className="apps__bar">
        <div className="segmented" role="tablist" aria-label="상태 필터">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={'segmented__item' + (tab === t.id ? ' is-active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label} <span className="segmented__count">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="searchpill searchpill--wide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#606874" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <label className="sr-only" htmlFor="app-search">신청 검색</label>
          <input id="app-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름, 신청자 번호, 파일명 검색" />
        </div>
      </div>

      <div className="panes panes--apps">
        <section className="card applist" aria-label="신청 목록">
          <div className="applist__rows">
            {error ? (
              <p className="empty" role="alert">{error}</p>
            ) : apps === null ? (
              <p className="empty">불러오는 중…</p>
            ) : visible.length === 0 ? (
              <p className="empty">조건에 맞는 신청이 없습니다.</p>
            ) : (
              visible.map((a) => {
                const st = APP_STATUS[appStatus(a)]
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={'approw' + (a.id === selectedId ? ' is-selected' : '')}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <span className={`avatar avatar--${st.tone}`} aria-hidden="true">{a.applicant_name?.[0] ?? '?'}</span>
                    <span className="approw__main">
                      <span className="approw__name">{a.applicant_name ?? '신청자 확인 불가'}</span>
                      <span className="muted small">{a.applicant_id ?? a.source_file_name}</span>
                    </span>
                    <span className="approw__side">
                      <span className={`pill pill--${st.tone}`}>{st.label}</span>
                      <span className="muted small">{formatShortDateTime(a.created_at)}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
          <div className="applist__footer">
            <UploadButton onClick={onSubmit} />
          </div>
        </section>

        {selected ? (
          <ApplicationDetail key={selected.id} app={selected} />
        ) : (
          <section className="card detail">
            <p className="empty">왼쪽에서 신청을 고르세요.</p>
          </section>
        )}
      </div>
    </main>
  )
}

function ApplicationDetail({ app }) {
  const status = appStatus(app)
  const st = APP_STATUS[status]
  const [docs, setDocs] = useState([])
  const [catalog, setCatalog] = useState([])
  const [docIndex, setDocIndex] = useState(0)

  useEffect(() => {
    api.getFieldCatalog().then(setCatalog).catch(() => {})
    if (app.is_stored) api.getDocuments(app.id).then(setDocs).catch(() => {})
  }, [app.id, app.is_stored])

  const failed = failedChecks(app.review_detail)
  const cross = app.review_detail?.cross_check ?? []
  const totalPages = Math.max(0, ...docs.map((d) => d.page_end))

  return (
    <section className="card detail" aria-label="신청 상세">
      <div className={`appdetail__head tint-${status}`}>
        <div>
          <h2 className="appdetail__name">{app.applicant_name ?? '신청자 확인 불가'}</h2>
          <p className="appdetail__meta">
            신청자 번호 {app.applicant_id ?? '없음'} · 생년월일 {app.birth_date ?? '—'} · 구분{' '}
            {APPLICANT_TYPES[app.applicant_type] ?? app.applicant_type} · 접수 {formatDateTime(app.created_at)}
          </p>
        </div>
        <div className="stamp" style={{ borderColor: RING[status], color: RING[status] }} aria-label={st.label}>
          {st.label}
        </div>
      </div>

      <div className="detail__body">
        <div className="panel panel--soft">
          <h3 className="panel__title">판단 근거</h3>
          <p className="basis">{app.reason}</p>
          <p className="muted small break">원본 파일 {app.source_file_name ?? '—'}</p>
        </div>

        {!app.is_stored && (
          <div>
            <h3 className="panel__title">{st.reasonTitle}</h3>
            <div className="stack">
              {(app.missing_documents ?? []).map((d) => (
                <Reason key={`m-${d}`} code="DOC_MISSING" title={`${DOC_LABELS[d] ?? d} 누락`}>
                  서류를 추가로 받아 다시 접수해야 합니다.
                </Reason>
              ))}
              {failed.map((c, i) => (
                <Reason key={`f-${i}`} code={c.issue_code ?? c.status} title={`${DOC_LABELS[c.doc_type] ?? c.doc_type}, ${fieldLabel(c.check)}`}>
                  {c.reason}
                </Reason>
              ))}
              {app.missing_documents?.length === 0 && failed.length === 0 && cross.length === 0 &&
                (app.reject_reasons ?? []).map((r) => (
                  <Reason key={`r-${r}`} title={r}>저장 조건을 만족하지 못했습니다.</Reason>
                ))}
              {cross.map((c, i) => (
                <Reason key={`c-${i}`} code={c.issue_code ?? 'CROSS_CHECK'} title={`서류 간 대조, ${fieldLabel(c.field)}`}>
                  {c.reason}
                </Reason>
              ))}
            </div>
            {app.issue_codes?.length > 0 && (
              <p className="codes">
                {app.issue_codes.map((c) => <span key={c} className="chip chip--code">{c}</span>)}
              </p>
            )}
            <p className="muted small">통과하지 못한 신청은 서류와 추출값을 저장하지 않습니다.</p>
          </div>
        )}

        {app.is_stored && docs.length > 0 && (
          <div>
            <h3 className="panel__title">저장된 서류</h3>
            <p className="muted small">
              PDF {totalPages}쪽에서 서류 {docs.length}종을 찾았습니다.
              {app.missing_documents?.length > 0 && (
                <span className="warn-text"> 누락: {app.missing_documents.map((m) => DOC_LABELS[m] ?? m).join(', ')}</span>
              )}
            </p>
            <div className="gallery" role="tablist" aria-label="서류 선택">
              {docs.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={i === docIndex}
                  className={'gallery__card' + (i === docIndex ? ' is-selected' : '')}
                  onClick={() => setDocIndex(i)}
                >
                  <span className="stack-thumb" aria-hidden="true">
                    <i /><i /><b><em /><em /><em /></b>
                  </span>
                  <span className="gallery__name">{DOC_LABELS[d.doc_type] ?? d.doc_type}</span>
                  <span className="muted small">
                    {d.page_start === d.page_end ? `${d.page_start}쪽` : `${d.page_start}–${d.page_end}쪽`} · {Object.keys(d.fields).length}개 항목
                  </span>
                </button>
              ))}
            </div>
            <FieldTable doc={docs[docIndex]} catalog={catalog} />
          </div>
        )}

        {app.is_stored && (
          <div className="reason reason--ok">
            <span className="chip chip--code">STORED</span>
            <div>
              <div className="strong">저장 완료</div>
              <p className="muted small">서류와 추출값이 저장되었습니다. 주민등록번호·면허번호는 해시로 보관해 원문을 볼 수 없습니다.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Reason({ code, title, children }) {
  return (
    <div className="reason">
      {code && <span className="chip chip--code">{code}</span>}
      <div>
        <div className="strong">{title}</div>
        <p className="muted small">{children}</p>
      </div>
    </div>
  )
}

function FieldTable({ doc, catalog }) {
  if (!doc) return null
  const entries = Object.entries(doc.fields)
  const scalars = entries.filter(([, v]) => !Array.isArray(v))
  const arrays = entries.filter(([, v]) => Array.isArray(v))
  const sens = (path) => lookupField(catalog, path, doc.doc_type).sensitivity

  return (
    <div role="tabpanel">
      <table className="table table--values">
        <thead>
          <tr><th scope="col">항목</th><th scope="col">값</th><th scope="col">민감도</th></tr>
        </thead>
        <tbody>
          {scalars.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{fieldLabel(k)}</th>
              <td><Value path={k} v={v} /></td>
              <td><SensBar level={sens(k)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {arrays.map(([k, rows]) => {
        const cols = Object.keys(rows[0] ?? {})
        return (
          <div key={k} className="nested">
            <h4 className="nested__title">
              {fieldLabel(k)} <span className="muted small">{rows.length}건</span>
            </h4>
            {rows.length === 0 ? (
              <p className="muted small">기록 없음</p>
            ) : (
              <div className="tablewrap">
                <table className="table table--grid">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c} scope="col">
                          {fieldLabel(c)}
                          <SensBar level={sens(`${k}[].${c}`)} compact />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => <td key={c}><Value path={c} v={r[c]} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 해시로 저장되는 값(주민등록번호·면허번호)은 가린 값만 보여준다
function Value({ path, v }) {
  if (isHashed(path)) {
    return (
      <span className="lock" title="원문은 해시로 저장되어 볼 수 없습니다">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
        </svg>
        <span className="sr-only">가려진 값</span>
        {formatValue(maskValue(path, v))}
      </span>
    )
  }
  return <span>{formatValue(v)}</span>
}

function SensBar({ level = 0, compact }) {
  return (
    <span className={'sens' + (compact ? ' sens--compact' : '')} role="img" aria-label={`민감도 ${level}`}>
      <span className="sens__bars">
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} style={{ background: n <= level ? SENS_COLOR[level] : '#E5E8ED' }} />
        ))}
      </span>
      {!compact && <span className="sens__num">{level}</span>}
    </span>
  )
}
