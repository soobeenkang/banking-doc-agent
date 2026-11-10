// 판정·상태·민감도 표시에 쓰는 공통 값. 색은 styles.css의 클래스와 1:1로 짝을 이룬다.

export const DECISION = {
  MANUAL_REVIEW: { label: '담당자 검토', tone: 'amber', canSend: true },
  SECURITY_BLOCKED: { label: '보안 차단', tone: 'red', canSend: false },
  APPROVED_WITH_CONDITIONS: { label: '조건부 승인', tone: 'blue', canSend: true },
  APPROVED: { label: '승인 가능', tone: 'green', canSend: true },
  NEEDS_DOCUMENT: { label: '서류 보완', tone: 'violet', canSend: false },
  OCR_RETRY: { label: '재인식 필요', tone: 'gray', canSend: false },
}

// 신청 상태. 통과(is_stored) 외에는 백엔드 decision(검토 필요 / 서류 누락)을 그대로 따른다.
export const APP_STATUS = {
  PASS: { label: '통과', tone: 'green', reasonTitle: '처리 결과' },
  REVIEW: { label: '검토 필요', tone: 'amber', reasonTitle: '검토 사유' },
  MISSING: { label: '서류 누락', tone: 'red', reasonTitle: '누락·보완 사유' },
}

export const RISK_TONE = { 낮음: 'green', 보통: 'blue', 높음: 'orange', '매우 높음': 'red' }

// 민감도 0~5에 따른 막대 색
export const SENS_COLOR = { 0: '#E5E8ED', 1: '#2F9C8E', 2: '#2F9C8E', 3: '#D7A545', 4: '#C4622D', 5: '#9E2B1F' }

// 민감도 칩 색 (요청 항목 표)
export const SENS_CHIP = {
  5: { bg: '#FCEBED', fg: '#B22E3B' },
  4: { bg: '#FAE3D3', fg: '#A0501A' },
  3: { bg: '#F4E7D1', fg: '#8C5F12' },
  2: { bg: '#EBEEF2', fg: '#555C68' },
  1: { bg: '#EBEEF2', fg: '#555C68' },
  0: { bg: '#EBEEF2', fg: '#555C68' },
}

export const ACTION_TONE = { 제공: 'green', 마스킹: 'amber', 제외: 'red', '확인 필요': 'gray' }

// ERD loan_applications 한 건 → 화면 상태. 저장됐으면 통과, 아니면 decision으로 구분.
// decision이 '처리 완료'인데 저장되지 않은 건(코드 검사 탈락)은 검토 필요로 본다.
export function appStatus(a) {
  if (a.is_stored) return 'PASS'
  if (a.decision === '서류 누락') return 'MISSING'
  return 'REVIEW'
}

// review_detail 에서 실패한 검사만 뽑는다.
// 백엔드: { validation: { documents: [{ doc_type, checks: [{ check, status, issue_code, reason }] }] }, cross_check }
// 목업:   { failed_checks: [...], cross_check }
export function failedChecks(detail) {
  if (!detail) return []
  if (detail.failed_checks) return detail.failed_checks
  return (detail.validation?.documents ?? []).flatMap((d) =>
    (d.checks ?? []).filter((c) => c.status && c.status !== 'PASS').map((c) => ({ ...c, doc_type: d.doc_type })),
  )
}

// LLM이 붙인 출처 표시(【†1】, [†2], [ +1] 등)를 지운다.
export function cleanText(v) {
  if (typeof v !== 'string') return v
  return v
    .replace(/\s*【[^】]*】/g, '')
    .replace(/\s*\[\s*[†+]\s*\d+(?:\s*[,†+]\s*\d+)*\s*\]/g, '')
    .trim()
}

// '2026-11-08T23:56:50.306254+09:00' / '2026-11-08 23:56' → Date
function toDate(v) {
  if (!v) return null
  const d = new Date(typeof v === 'string' && !v.includes('T') ? v.replace(' ', 'T') : v)
  return Number.isNaN(d.getTime()) ? null : d
}
const pad = (n) => String(n).padStart(2, '0')

// 상세용: 2026.11.08 23:56
export function formatDateTime(v) {
  const d = toDate(v)
  if (!d) return v ?? '—'
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 목록용: 오늘이면 23:56, 올해면 11.08 23:56, 그 외 2025.11.08
export function formatShortDateTime(v) {
  const d = toDate(v)
  if (!d) return v ?? ''
  const now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return `오늘 ${time}`
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${time}`
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}
