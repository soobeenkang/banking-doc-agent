import { DOC_LABELS } from '../lib/fields.js';

// 신청 건 상태: is_stored 가 true면 통과, 아니면 decision 으로 구분
export function appState(a) {
  if (a.is_stored) return { key: 'pass', label: '통과' };
  if (a.decision === '반려') return { key: 'reject', label: '반려' };
  return { key: 'review', label: a.decision || '보완 필요' };
}

export function StateTag({ state, children }) {
  return <span className={`tag tag-${state}`}>{children}</span>;
}

// 민감도 0~5 를 다섯 칸 눈금으로 표시
export function Sensitivity({ value, showNumber = true }) {
  const v = Math.max(0, Math.min(5, value ?? 0));
  const tone = v >= 5 ? 'hi' : v >= 3 ? 'mid' : 'lo';
  return (
    <span className={`sens sens-${tone}`} title={`민감도 ${v} / 5`} aria-label={`민감도 ${v} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= v ? 'on' : ''} />
      ))}
      {showNumber && <b>{v}</b>}
    </span>
  );
}

// 병합된 PDF 가 어떤 서류로 나뉘었는지 페이지 썸네일로 표시
export function PageRibbon({ docs, active, onSelect, missing = [] }) {
  const total = Math.max(...docs.map((d) => d.page_end), 1);
  return (
    <div className="ribbon-wrap">
      <div className="pages" role="tablist" aria-label="서류 구간">
        {docs.map((d, i) => {
          const nums = Array.from({ length: d.page_end - d.page_start + 1 }, (_, k) => d.page_start + k);
          return (
            <button key={d.id} role="tab" aria-selected={active === i} className={`doc-group ${active === i ? 'on' : ''}`} onClick={() => onSelect(i)}>
              <span className="thumbs" aria-hidden="true">
                {nums.map((n) => (
                  <span key={n} className="thumb">
                    <i />
                    <i />
                    <i />
                    <b>{n}</b>
                  </span>
                ))}
              </span>
              <span className="doc-name">{DOC_LABELS[d.doc_type] ?? d.doc_type}</span>
            </button>
          );
        })}
      </div>
      <div className="ribbon-foot">
        <span>PDF {total}쪽에서 서류 {docs.length}종을 찾았습니다</span>
        {missing.length > 0 && <span className="warn-text">누락: {missing.map((m) => DOC_LABELS[m] ?? m).join(', ')}</span>}
      </div>
    </div>
  );
}

// 상세 화면 상단의 상태 도장
export function Stamp({ state, children }) {
  return (
    <span className={`stamp stamp-${state}`} role="status">
      <span>{children}</span>
    </span>
  );
}

// 이름 첫 글자 동그라미
export function Initial({ text, state, square }) {
  return (
    <span className={`initial initial-${state} ${square ? 'sq' : ''}`} aria-hidden="true">
      {text ? text[0] : '?'}
    </span>
  );
}

// 위험 점수 반원 다이얼 (0~100)
export function RiskDial({ score, state, label }) {
  return (
    <div className={`dial dial-${state}`} role="img" aria-label={`위험 점수 ${score}점, ${label}`}>
      <svg viewBox="0 0 120 68">
        <path d="M10 62 A50 50 0 0 1 110 62" pathLength="100" className="track" />
        <path d="M10 62 A50 50 0 0 1 110 62" pathLength="100" className="fill" strokeDasharray={`${score} 100`} />
      </svg>
      <div className="dial-text">
        <strong className="num">{score}</strong>
        <span>위험도 {label}</span>
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} role="radio" aria-checked={value === o.key} className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}
