import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import UploadButton from '../components/UploadButton.jsx'
import { ACTION_TONE, DECISION, SENS_CHIP } from '../lib/format.js'

// 현황 카드. 누르면 그 조건으로 수신함을 거른다(다시 누르면 해제).
const KPI = [
  { key: 'today', icon: '/emoji/inbox.png', label: '오늘 접수', color: 'var(--text)', match: (m) => m.received?.startsWith('오늘') },
  { key: 'review', icon: '/emoji/hourglass.png', label: '담당자 검토 대기', color: '#8C5F12', match: (m) => m.decision === 'MANUAL_REVIEW' && !m.sent },
  { key: 'blocked', icon: '/emoji/locked.png', label: '보안 차단', color: '#B22E3B', match: (m) => m.decision === 'SECURITY_BLOCKED' },
  { key: 'fix', icon: '/emoji/memo.png', label: '서류 보완·재인식', color: '#4A3FA7', match: (m) => m.decision === 'NEEDS_DOCUMENT' || m.decision === 'OCR_RETRY' },
]

export default function MailPage({ onChanged, onSubmit }) {
  const [mails, setMails] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [readIds, setReadIds] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState({})
  const [attached, setAttached] = useState({})
  const [kpiFilter, setKpiFilter] = useState(null)
  const [loadError, setLoadError] = useState('')

  function load() {
    setLoadError('')
    return api
      .getMails()
      .then((list) => {
        setMails(list)
        // 처음 열 때만 첫 메일을 고른다. 새로고침 때는 보던 메일을 유지한다.
        setSelectedId((cur) => (cur && list.some((m) => m.id === cur) ? cur : list[0]?.id ?? null))
        if (list.length) setReadIds((prev) => (prev.size ? prev : new Set([list[0].id])))
      })
      .catch((e) => setLoadError(e.message))
  }
  useEffect(() => {
    load()
  }, [])

  // 별(중요) 표시: 화면을 먼저 바꾸고, 저장에 실패하면 되돌린다.
  async function star(id, on) {
    setMails((list) => list.map((m) => (m.id === id ? { ...m, starred: on } : m)))
    try {
      await api.starMail(id, on)
    } catch (e) {
      setMails((list) => list.map((m) => (m.id === id ? { ...m, starred: !on } : m)))
      setLoadError(`중요 표시를 저장하지 못했습니다. ${e.message}`)
    }
  }

  const kpiCounts = useMemo(
    () => Object.fromEntries(KPI.map((k) => [k.key, mails.filter(k.match).length])),
    [mails],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const kpi = KPI.find((k) => k.key === kpiFilter)
    return mails.filter((m) => {
      if (kpi && !kpi.match(m)) return false
      if (!q) return true
      return `${m.org} ${m.title} ${m.snippet}`.toLowerCase().includes(q)
    })
  }, [mails, query, kpiFilter])

  function toggleKpi(key) {
    const next = kpiFilter === key ? null : key
    setKpiFilter(next)
    // 선택된 메일이 걸러지면 걸러진 목록의 첫 메일을 연다
    const kpi = KPI.find((k) => k.key === next)
    const cur = mails.find((m) => m.id === selectedId)
    if (kpi && (!cur || !kpi.match(cur))) {
      const first = mails.find(kpi.match)
      if (first) select(first.id)
    }
  }

  const selected = mails.find((m) => m.id === selectedId)
  const unreadCount = mails.filter((m) => m.unread && !readIds.has(m.id)).length

  function select(id) {
    setSelectedId(id)
    setReadIds((prev) => new Set(prev).add(id))
  }

  return (
    <main className="page page--mail">
      <section className="kpi-grid" aria-label="오늘 현황">
        {KPI.map((k) => (
          <button
            type="button"
            className={'kpi' + (kpiFilter === k.key ? ' is-active' : '')}
            key={k.key}
            aria-pressed={kpiFilter === k.key}
            onClick={() => toggleKpi(k.key)}
          >
            <img className="kpi__icon" src={k.icon} alt="" width="40" height="40" />
            <span className="kpi__value" style={{ color: k.color }}>{kpiCounts[k.key] ?? 0}</span>
            <span className="kpi__label">{k.label}</span>
          </button>
        ))}
      </section>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      <div className="panes">
        <Mailbox
          mails={visible}
          total={mails.length}
          unread={unreadCount}
          selectedId={selectedId}
          readIds={readIds}
          query={query}
          onQuery={setQuery}
          filterLabel={KPI.find((k) => k.key === kpiFilter)?.label}
          onClearFilter={() => setKpiFilter(null)}
          onSelect={select}
          onStar={star}
          onRefresh={load}
          onSubmit={onSubmit}
        />
        {selected && (
          <MailDetail
            key={selected.id}
            mail={selected}
            reply={drafts[selected.id] ?? selected.reply}
            onReply={(text) => setDrafts((d) => ({ ...d, [selected.id]: text }))}
            attached={attached}
            onToggleAttach={(index, current) =>
              setAttached((a) => ({ ...a, [`${selected.id}:${index}`]: !current }))
            }
            isSent={selected.sent}
            onSend={async (payload) => {
              await api.sendMail(selected.id, payload)
              setMails((list) => list.map((m) => (m.id === selected.id ? { ...m, sent: true } : m)))
              onChanged?.()
            }}
          />
        )}
      </div>
    </main>
  )
}

function Mailbox({ mails, total, unread, selectedId, readIds, query, onQuery, filterLabel, onClearFilter, onSelect, onStar, onRefresh, onSubmit }) {
  return (
    <section className="card mailbox" aria-label="수신함">
      <div className="mailbox__search">
        <label className="sr-only" htmlFor="mail-search">메일 검색</label>
        <div className="searchpill">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#606874" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input id="mail-search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="보낸 사람, 제목, 고객명 검색" />
        </div>
      </div>

      <div className="folders" role="tablist" aria-label="편지함">
        <button type="button" role="tab" aria-selected="true" className="folders__tab is-active">
          받은편지함 <span className="count-badge">{unread}</span>
        </button>
        <button type="button" role="tab" aria-selected="false" className="folders__tab">처리 완료</button>
        <button type="button" role="tab" aria-selected="false" className="folders__tab">보낸편지함</button>
      </div>

      <div className="mailbox__toolbar">
        <button type="button" className="iconbtn" onClick={onRefresh} aria-label="새로고침">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#606874" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.7" />
            <path d="M20 4v5h-5" />
          </svg>
        </button>
        {filterLabel && (
          <button type="button" className="filterchip" onClick={onClearFilter} aria-label={`${filterLabel} 필터 해제`}>
            {filterLabel} <span aria-hidden="true">×</span>
          </button>
        )}
        <span className="mailbox__range">{mails.length ? `1–${mails.length}` : '0'} / {total}</span>
      </div>

      <div className="mailbox__list">
        {mails.map((m) => {
          const isUnread = m.unread && !readIds.has(m.id)
          const dec = DECISION[m.decision]
          return (
            <div
              key={m.id}
              className={'mailrow' + (m.id === selectedId ? ' is-selected' : '') + (isUnread ? ' is-unread' : '')}
            >
              <button
                type="button"
                className={'star' + (m.starred ? ' is-on' : '')}
                aria-pressed={!!m.starred}
                aria-label={m.starred ? `${m.org} 메일 중요 표시 해제` : `${m.org} 메일 중요 표시`}
                onClick={() => onStar(m.id, !m.starred)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9L12 3z" />
                </svg>
              </button>
              <button type="button" className="mailrow__main" onClick={() => onSelect(m.id)} aria-current={m.id === selectedId || undefined}>
                <span className="mailrow__top">
                  <span className="mailrow__sender">
                    {isUnread && <span className="dot" />}
                    {m.org}
                  </span>
                  <span className="mailrow__time">{m.time}</span>
                </span>
                <span className="mailrow__subject">{m.title}</span>
                <span className="mailrow__snippet">{m.snippet}</span>
                <span className="mailrow__meta">
                  <span className={`pill pill--${dec.tone}`}>{dec.label}</span>
                  <span className="muted small">{m.score > 0 ? `위험도 ${m.score}` : m.level}</span>
                  {m.hasAttachment && (
                    <svg className="mailrow__clip" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#606874" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="첨부 파일 있음">
                      <path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          )
        })}
        {mails.length === 0 && <p className="empty">조건에 맞는 메일이 없습니다.</p>}
      </div>

      <div className="mailbox__footer">
        <UploadButton onClick={onSubmit} />
      </div>
    </section>
  )
}

function MailDetail({ mail, reply, onReply, attached, onToggleAttach, isSent, onSend }) {
  const dec = DECISION[mail.decision]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const attachments = mail.attachments.map((a, index) => ({
    ...a,
    index,
    on: attached[`${mail.id}:${index}`] ?? a.attached,
  }))
  const attachedCount = attachments.filter((a) => a.on).length

  async function send() {
    setBusy(true)
    setError('')
    try {
      await onSend({ reply, attachments: attachments.filter((a) => a.on).map((a) => a.name) })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card detail" aria-label="메일 상세">
      <div className="detail__head">
        <div className="detail__title">
          <h1>{mail.title}</h1>
          <p className="muted small">{mail.org} · {mail.received}</p>
        </div>
        <div className="detail__score">
          <span className="muted small">
            위험도 <b className="detail__scorenum">{mail.score > 0 ? mail.score : '-'}</b> · {mail.level}
          </span>
          <span className={`pill pill--lg pill--${dec.tone}`}>{dec.label}</span>
        </div>
      </div>

      <div className="detail__body">
        <div className="grid2">
          <div className="panel panel--soft">
            <h2 className="panel__title">메일 원문</h2>
            <p className="mailmeta">
              보낸 사람 · {mail.from}<br />
              받는 사람 · 자료제공 담당 데스크<br />
              수신 · {mail.received}
            </p>
            <p className="mailbody">{mail.body}</p>
          </div>

          <div className="panel panel--outline stack-lg">
            <div>
              <h2 className="panel__title">누가 무엇을 요청했나요</h2>
              <dl className="kv">
                {mail.who.map(([k, v]) => (
                  <div className="kv__row" key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h2 className="panel__title">요청 항목과 민감도</h2>
              <div className="fieldlist">
                {mail.fields.map((f) => (
                  <div className="fieldlist__row" key={f.name}>
                    <span className="fieldlist__name">{f.name}</span>
                    <span
                      className="chip"
                      style={{ background: SENS_CHIP[f.level].bg, color: SENS_CHIP[f.level].fg }}
                    >
                      {f.level > 0 ? `민감도 ${f.level}` : '-'}
                    </span>
                    <span className={`fieldlist__action tone-${ACTION_TONE[f.action] || 'gray'}`}>{f.action}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="panel__title">판단 근거</h2>
              <ul className="bullets">
                {mail.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <p className="note" role="note">{mail.note}</p>
            </div>
          </div>
        </div>

        <div className="grid2">
          <div className="panel panel--outline compose">
            <div className="compose__head">
              <h2 className="panel__title">회신 쓰기</h2>
              <button type="button" className="btn btn--soft btn--sm" onClick={() => navigator.clipboard?.writeText(reply)}>
                복사
              </button>
            </div>
            <div className="compose__box">
              <div className="compose__row"><span>받는 사람</span><span className="break">{mail.from}</span></div>
              <div className="compose__row"><span>제목</span><span>Re: {mail.title}</span></div>
              <label className="sr-only" htmlFor="reply-body">회신 내용</label>
              <textarea id="reply-body" rows={9} value={reply} onChange={(e) => onReply(e.target.value)} />
            </div>
            <div className="compose__foot">
              <span className="muted small">{attachments.length ? `첨부 ${attachedCount}개 포함` : '첨부 없음'}</span>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!dec.canSend || isSent || busy}
                onClick={send}
              >
                {isSent ? '전송됨' : busy ? '전송 중…' : '전송'}
              </button>
            </div>
            {!dec.canSend && <p className="compose__hint">{dec.label} 건은 전송할 수 없습니다.</p>}
            {error && <p className="compose__hint" role="alert">{error}</p>}
          </div>

          <div className="panel panel--outline stack">
            <h2 className="panel__title">마스킹한 첨부 문서</h2>
            {attachments.map((a) => (
              <div className="attach" key={a.name}>
                <div className="docthumb" aria-hidden="true">
                  <i /><i className={a.masked ? 'is-masked' : ''} /><i /><i className={a.masked ? 'is-masked' : ''} />
                </div>
                <div className="attach__info">
                  <div className="attach__name">{a.name}</div>
                  <div className="muted small">{a.meta}</div>
                </div>
                <button
                  type="button"
                  className={'btn btn--sm ' + (a.on ? 'btn--soft-green' : 'btn--outline')}
                  onClick={() => onToggleAttach(a.index, a.on)}
                >
                  {a.on ? '회신에 첨부됨' : '회신에 첨부'}
                </button>
              </div>
            ))}
            <p className="muted small">{mail.attachmentNote}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
