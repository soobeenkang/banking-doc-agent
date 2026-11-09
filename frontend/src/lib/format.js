// 판정·상태·민감도 표시에 쓰는 공통 값. 색은 styles.css의 클래스와 1:1로 짝을 이룬다.

export const DECISION = {
  MANUAL_REVIEW: { label: '담당자 검토', tone: 'amber', canSend: true },
  SECURITY_BLOCKED: { label: '보안 차단', tone: 'red', canSend: false },
  APPROVED_WITH_CONDITIONS: { label: '조건부 승인', tone: 'blue', canSend: true },
  APPROVED: { label: '승인 가능', tone: 'green', canSend: true },
  NEEDS_DOCUMENT: { label: '서류 보완', tone: 'violet', canSend: false },
  OCR_RETRY: { label: '재인식 필요', tone: 'gray', canSend: false },
}

export const APP_STATUS = {
  PASS: { label: '통과', tone: 'green', reasonTitle: '처리 결과' },
  FIX: { label: '보완 필요', tone: 'amber', reasonTitle: '보완 사유' },
  REJECT: { label: '반려', tone: 'red', reasonTitle: '반려 사유' },
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

// ERD loan_applications 한 건 → 화면 상태(PASS/FIX/REJECT). is_stored 면 통과, 아니면 decision 으로 구분
export function appStatus(a) {
  if (a.is_stored) return 'PASS'
  if (a.decision === '반려') return 'REJECT'
  return 'FIX'
}
