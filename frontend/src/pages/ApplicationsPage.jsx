import { useEffect, useMemo, useState } from 'react';
import { getApplications, getDocuments, getFieldCatalog } from '../api.js';
import { appState, Empty, Initial, PageRibbon, Segmented, Sensitivity, Stamp, StateTag } from '../components/ui.jsx';
import { APPLICANT_TYPES, DOC_LABELS, fieldLabel, formatValue, isHashed, lookupField, maskValue } from '../lib/fields.js';

export default function ApplicationsPage({ focusId }) {
  const [apps, setApps] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(focusId);

  useEffect(() => {
    getApplications().then((a) => {
      setApps(a);
      setSelId((cur) => focusId ?? cur ?? a[0]?.id);
    });
  }, [focusId]);

  const counts = useMemo(() => {
    const c = { all: 0, pass: 0, review: 0, reject: 0 };
    (apps ?? []).forEach((a) => {
      c.all++;
      c[appState(a).key]++;
    });
    return c;
  }, [apps]);

  const list = (apps ?? []).filter((a) => {
    if (filter !== 'all' && appState(a).key !== filter) return false;
    if (!q) return true;
    return `${a.applicant_name ?? ''} ${a.applicant_id ?? ''} ${a.source_file_name}`.toLowerCase().includes(q.toLowerCase());
  });
  const selected = apps?.find((a) => a.id === selId);

  return (
    <div className="page">
      <header className="page-head">
        <h1>신청 내역</h1>
        <p>접수된 모든 신청을 보관합니다. 통과한 건만 서류와 추출값이 저장되고, 나머지는 사유만 남습니다.</p>
      </header>

      <div className="toolbar">
        <Segmented
          label="상태 필터"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: '전체', count: counts.all },
            { key: 'review', label: '보완 필요', count: counts.review },
            { key: 'pass', label: '통과', count: counts.pass },
            { key: 'reject', label: '반려', count: counts.reject },
          ]}
        />
        <input className="search" type="search" placeholder="이름, 신청자 번호, 파일명" value={q} onChange={(e) => setQ(e.target.value)} aria-label="신청 검색" />
      </div>

      <div className="split">
        <section className="list" aria-label="신청 목록">
          {apps === null ? (
            <Empty title="불러오는 중" />
          ) : list.length === 0 ? (
            <Empty title="조건에 맞는 신청이 없습니다">필터를 바꾸거나 검색어를 지워 보세요.</Empty>
          ) : (
            list.map((a) => {
              const s = appState(a);
              return (
                <button key={a.id} className={`row row-${s.key} ${a.id === selId ? 'on' : ''}`} onClick={() => setSelId(a.id)}>
                  <Initial text={a.applicant_name} state={s.key} />
                  <span className="row-main">
                    <strong>{a.applicant_name ?? '신청자 확인 불가'}</strong>
                    <span className="num">{a.applicant_id ?? a.source_file_name}</span>
                  </span>
                  <span className="row-side">
                    <StateTag state={s.key}>{s.label}</StateTag>
                    <span className="num small">{a.created_at.slice(5)}</span>
                  </span>
                </button>
              );
            })
          )}
        </section>

        <section className="detail" aria-label="신청 상세">
          {selected ? <AppDetail key={selected.id} app={selected} /> : <Empty title="왼쪽에서 신청을 고르세요" />}
        </section>
      </div>
    </div>
  );
}

function AppDetail({ app }) {
  const s = appState(app);
  const [docs, setDocs] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    getFieldCatalog().then(setCatalog);
    if (app.is_stored) getDocuments(app.id).then(setDocs);
  }, [app.id, app.is_stored]);

  const failed = app.review_detail?.failed_checks ?? [];
  const cross = app.review_detail?.cross_check ?? [];

  return (
    <article className={`sheet sheet-${s.key}`}>
      <header className="sheet-head">
        <div>
          <h2>{app.applicant_name ?? '신청자 확인 불가'}</h2>
          <dl className="facts">
            <div>
              <dt>신청자 번호</dt>
              <dd className="num">{app.applicant_id ?? '없음'}</dd>
            </div>
            <div>
              <dt>생년월일</dt>
              <dd className="num">{app.birth_date ?? '—'}</dd>
            </div>
            <div>
              <dt>구분</dt>
              <dd>{APPLICANT_TYPES[app.applicant_type] ?? app.applicant_type}</dd>
            </div>
            <div>
              <dt>접수</dt>
              <dd className="num">{app.created_at}</dd>
            </div>
          </dl>
        </div>
        <Stamp state={s.key}>{s.label}</Stamp>
      </header>

      <section className="verdict">
        <h3>판단 근거</h3>
        <p>{app.reason}</p>
        <p className="muted small">
          원본 파일 {app.source_file_name}, 실행 번호 <span className="num">{app.job_id}</span>
        </p>
      </section>

      {!app.is_stored && (
        <section className="problems">
          <h3>{s.key === 'reject' ? '반려 사유' : '보완할 내용'}</h3>
          <ul className="issue-list">
            {app.missing_documents.map((d) => (
              <li key={`m-${d}`}>
                <strong>{DOC_LABELS[d] ?? d} 누락</strong>
                <span>서류를 추가로 받아 다시 접수해야 합니다.</span>
              </li>
            ))}
            {failed.map((c, i) => (
              <li key={`f-${i}`}>
                <strong>
                  {DOC_LABELS[c.doc_type] ?? c.doc_type}, {fieldLabel(c.check)}
                </strong>
                <span>{c.reason}</span>
                {c.issue_code && <code>{c.issue_code}</code>}
              </li>
            ))}
            {cross.map((c, i) => (
              <li key={`c-${i}`}>
                <strong>서류 간 대조, {fieldLabel(c.field)}</strong>
                <span>{c.reason}</span>
              </li>
            ))}
          </ul>
          {app.issue_codes.length > 0 && (
            <p className="codes">
              {app.issue_codes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </p>
          )}
          <p className="muted small">통과하지 못한 신청은 서류와 추출값을 저장하지 않습니다.</p>
        </section>
      )}

      {app.is_stored && docs.length > 0 && (
        <section className="docs">
          <h3>저장된 서류</h3>
          <PageRibbon docs={docs} active={active} onSelect={setActive} missing={app.missing_documents} />
          <FieldTable doc={docs[active]} catalog={catalog} />
        </section>
      )}
    </article>
  );
}

function FieldTable({ doc, catalog }) {
  if (!doc) return null;
  const entries = Object.entries(doc.fields);
  const scalars = entries.filter(([, v]) => !Array.isArray(v));
  const arrays = entries.filter(([, v]) => Array.isArray(v));
  const sens = (path) => lookupField(catalog, path, doc.doc_type).sensitivity;

  return (
    <div className="fields" role="tabpanel">
      <table className="field-table">
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">값</th>
            <th scope="col" className="right">민감도</th>
          </tr>
        </thead>
        <tbody>
          {scalars.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{fieldLabel(k)}</th>
              <td>
                <Value path={k} v={v} />
              </td>
              <td className="right">
                <Sensitivity value={sens(k)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {arrays.map(([k, rows]) => {
        const cols = Object.keys(rows[0] ?? {});
        return (
          <div key={k} className="nested">
            <h4>
              {fieldLabel(k)} <span className="muted">{rows.length}건</span>
            </h4>
            {rows.length === 0 ? (
              <p className="muted small">기록 없음</p>
            ) : (
              <div className="scroll-x">
                <table className="grid-table">
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c} scope="col">
                          {fieldLabel(c)}
                          <Sensitivity value={sens(`${k}[].${c}`)} showNumber={false} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {cols.map((c) => (
                          <td key={c}>
                            <Value path={c} v={r[c]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Value({ path, v }) {
  if (isHashed(path)) {
    return (
      <span className="hashed" title="원문은 해시로 저장되어 볼 수 없습니다">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
        </svg>
        <span className="num">{formatValue(maskValue(path, v))}</span>
      </span>
    );
  }
  return <span className={typeof v === 'number' ? 'num' : ''}>{formatValue(v)}</span>;
}
