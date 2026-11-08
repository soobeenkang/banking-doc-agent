import { useEffect, useMemo, useState } from 'react';
import { getFieldCatalog, getRequests, updateRequest } from '../api.js';
import { Empty, Initial, RiskDial, Segmented, Sensitivity, Stamp, StateTag } from '../components/ui.jsx';
import { DOC_LABELS, fieldLabel, formatValue, lookupField, RISK_GROUPS } from '../lib/fields.js';

const RISK = {
  LOW: { label: '낮음', key: 'pass' },
  MEDIUM: { label: '보통', key: 'review' },
  HIGH: { label: '높음', key: 'reject' },
};
const STATUS = {
  대기: 'review',
  '회신 완료': 'pass',
  거절: 'reject',
};

export default function RequestsPage({ onChanged }) {
  const [reqs, setReqs] = useState(null);
  const [filter, setFilter] = useState('대기');
  const [selId, setSelId] = useState(null);
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    getFieldCatalog().then(setCatalog);
    getRequests().then((r) => {
      setReqs(r);
      setSelId(r.find((x) => x.status === '대기')?.id ?? r[0]?.id);
    });
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, 대기: 0, done: 0 };
    (reqs ?? []).forEach((r) => {
      c.all++;
      if (r.status === '대기') c.대기++;
      else c.done++;
    });
    return c;
  }, [reqs]);

  const list = (reqs ?? []).filter((r) => (filter === 'all' ? true : filter === '대기' ? r.status === '대기' : r.status !== '대기'));
  const selected = reqs?.find((r) => r.id === selId);

  const save = async (patch) => {
    const u = await updateRequest(selected.id, patch);
    setReqs((prev) => prev.map((r) => (r.id === u.id ? u : r)));
    onChanged?.();
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>정보 제공 요청</h1>
        <p>다른 금융회사가 메일로 보낸 고객 정보 요청입니다. 요청 범위와 위험도를 확인하고 회신하세요.</p>
      </header>

      <div className="toolbar">
        <Segmented
          label="처리 상태"
          value={filter}
          onChange={setFilter}
          options={[
            { key: '대기', label: '회신 대기', count: counts.대기 },
            { key: 'done', label: '처리 완료', count: counts.done },
            { key: 'all', label: '전체', count: counts.all },
          ]}
        />
      </div>

      <div className="split">
        <section className="list" aria-label="요청 목록">
          {reqs === null ? (
            <Empty title="불러오는 중" />
          ) : list.length === 0 ? (
            <Empty title="회신할 요청이 없습니다">새 요청 메일이 오면 여기에 표시됩니다.</Empty>
          ) : (
            list.map((r) => {
              const risk = RISK[r.risk_level] ?? RISK.MEDIUM;
              return (
                <button key={r.id} className={`row row-${risk.key} ${r.id === selId ? 'on' : ''}`} onClick={() => setSelId(r.id)}>
                  <Initial text={r.requester_company} state={risk.key} square />
                  <span className="row-main">
                    <strong>{r.requester_company}</strong>
                    <span className="small muted">{r.request_reason}</span>
                  </span>
                  <span className="row-side">
                    <StateTag state={STATUS[r.status] ?? 'review'}>{r.status}</StateTag>
                    <span className="num small">{r.received_at.slice(5)}</span>
                  </span>
                </button>
              );
            })
          )}
        </section>

        <section className="detail" aria-label="요청 상세">
          {selected ? <RequestDetail key={selected.id} req={selected} catalog={catalog} onSave={save} /> : <Empty title="왼쪽에서 요청을 고르세요" />}
        </section>
      </div>
    </div>
  );
}

function RequestDetail({ req, catalog, onSave }) {
  const [message, setMessage] = useState(req.response_payload?.message ?? '');
  const [busy, setBusy] = useState(false);
  const risk = RISK[req.risk_level] ?? RISK.MEDIUM;
  const blocked = req.decision === '공개 불가';
  const open = req.status === '대기';

  const act = async (status) => {
    setBusy(true);
    await onSave({ status, response_payload: { ...req.response_payload, message } });
    setBusy(false);
  };

  const outcome = (path) => {
    if (req.missing_items.includes(path)) return { label: '자료 없음', key: 'none' };
    if (blocked) return { label: '제공 안 함', key: 'reject' };
    if (req.masking_fields.includes(path)) return { label: '가려서 제공', key: 'review' };
    return { label: '제공', key: 'pass' };
  };

  return (
    <article className={`sheet sheet-${risk.key}`}>
      <header className="sheet-head">
        <div>
          <h2>{req.requester_company}</h2>
          <dl className="facts">
            <div>
              <dt>보낸 주소</dt>
              <dd>{req.requester_email}</dd>
            </div>
            <div>
              <dt>대상 고객</dt>
              <dd className="num">{req.applicant_id}</dd>
            </div>
            <div>
              <dt>받은 시각</dt>
              <dd className="num">{req.received_at}</dd>
            </div>
          </dl>
        </div>
        <Stamp state={STATUS[req.status] ?? 'review'}>{req.status}</Stamp>
      </header>

      <section>
        <h3>요청 내용</h3>
        <blockquote className="mail">{req.request_reason}</blockquote>
      </section>

      <section className="risk">
        <RiskDial score={req.risk_score} state={risk.key} label={risk.label} />
        <div className="risk-decision">
          <span className="muted small">자동 판단</span>
          <strong>{req.decision}</strong>
          <span className="codes">
            {req.reason_codes.map((c) => (
              <code key={c}>{c}</code>
            ))}
          </span>
        </div>
      </section>

      <section>
        <h3>요청한 항목 {req.requested_fields.length}개</h3>
        <table className="field-table">
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">분류</th>
              <th scope="col">민감도</th>
              <th scope="col" className="right">처리</th>
            </tr>
          </thead>
          <tbody>
            {req.requested_fields.map((path) => {
              const meta = lookupField(catalog, path);
              const o = outcome(path);
              return (
                <tr key={path}>
                  <th scope="row">
                    {fieldLabel(path)}
                    <span className="muted small block">{DOC_LABELS[meta.doc_type] ?? meta.doc_type}</span>
                  </th>
                  <td>{RISK_GROUPS[meta.risk_group] ?? meta.risk_group}</td>
                  <td>
                    <Sensitivity value={meta.sensitivity} />
                  </td>
                  <td className="right">
                    <span className={`outcome outcome-${o.key}`}>{o.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3>회신 미리보기</h3>
        <div className="letter">
          <p className="letter-to">받는 곳: {req.requester_email}</p>
          {Object.keys(req.response_payload?.fields ?? {}).length > 0 && (
            <dl className="letter-fields">
              {Object.entries(req.response_payload.fields).map(([k, v]) => (
                <div key={k}>
                  <dt>{fieldLabel(k)}</dt>
                  <dd className="num">{Array.isArray(v) ? v.map(formatValue).join(', ') : formatValue(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          <label className="letter-msg">
            <span className="muted small">본문</span>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} disabled={!open} />
          </label>
        </div>
      </section>

      {open ? (
        <div className="panel-actions">
          <button className="btn danger" disabled={busy} onClick={() => act('거절')}>
            요청 거절
          </button>
          <button className="btn primary" disabled={busy || !message.trim()} onClick={() => act('회신 완료')}>
            {blocked ? '거절 사유 회신' : '회신 보내기'}
          </button>
        </div>
      ) : (
        <p className="muted small done-note">이 요청은 {req.status} 상태입니다.</p>
      )}
    </article>
  );
}
