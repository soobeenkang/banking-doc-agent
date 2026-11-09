// 데이터 계층. 기본은 목업 데이터로 동작하고, VITE_USE_MOCK=false 이면 FastAPI를 호출한다.
//
// 백엔드가 돌려줘야 하는 모양
//   GET  /api/mails                         -> Mail[]               (src/data/mails.js 형태 + sent: boolean)
//   POST /api/mails/{id}/send               -> { ok: true }         body: { reply, attachments: string[] }
//   GET  /api/applications                  -> LoanApplication[]    (ERD loan_applications, src/mock/data.js 참고)
//   GET  /api/applications/{id}/documents   -> Document[]           (ERD documents, 통과 건만 존재)
//   GET  /api/field-catalog                 -> FieldCatalog[]       (ERD field_catalog)
//   POST /api/applications                  -> LoanApplication      multipart/form-data, 필드명 file (워크플로우 1)

import { MAILS } from './data/mails.js'
import { DECISION } from './lib/format.js'
import sample from './mock/sample-w1.json'
import { documents, fieldCatalog, loanApplications, makeDocuments } from './mock/data.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const delay = (value, ms = 120) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

async function call(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || `요청 실패 (${res.status})`)
  return body
}

const postJson = (data) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

// ---------- 목업 상태 (새로고침 전까지 유지) ----------
let mockMails = MAILS.map((m) => ({ ...structuredClone(m), sent: false }))
let mockApps = [...loanApplications]
const mockDocs = { ...documents }

const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 워크플로우 1 결과 흉내: 60%는 통과, 나머지는 재직증명서 누락으로 보완 필요
function mockReview(file) {
  const id = Math.max(...mockApps.map((a) => a.id)) + 1
  const ok = Math.random() < 0.6
  const person = { id: `TEST-2026-${String(id).padStart(4, '0')}`, name: '김도윤', birth: '1997-03-15', rrn: '970315-1000000' }
  const base = {
    id,
    job_id: `job_${id}${Math.random().toString(36).slice(2, 10)}`,
    source_file_name: file.name,
    created_at: now(),
    applicant_id: person.id,
    applicant_name: person.name,
    birth_date: person.birth,
    applicant_type: 'EMP',
  }
  const app = ok
    ? {
        ...base, decision: '처리 완료', is_stored: true, reject_reasons: [], reason: sample.reason,
        issue_codes: [], missing_documents: [], document_types: sample.document_types, review_detail: null,
      }
    : {
        ...base, decision: '보완 필요', is_stored: false, reject_reasons: ['재직증명서 누락'],
        reason: '재직증명서가 없어 대출신청서의 직장 정보를 대조할 수 없습니다.',
        issue_codes: ['DOC_MISSING'], missing_documents: ['employment_certificate'],
        document_types: sample.document_types.filter((t) => t !== 'employment_certificate'),
        review_detail: { failed_checks: [], cross_check: [{ field: 'company_name', reason: '대조할 재직증명서가 없습니다.' }] },
      }
  mockApps = [app, ...mockApps]
  if (ok) mockDocs[id] = makeDocuments(id, person)
  return app
}

export const api = {
  // ---------- 자료 제공 요청 메일 ----------
  getMails: () => (USE_MOCK ? delay(structuredClone(mockMails)) : call('/api/mails')),

  sendMail: (id, payload) => {
    if (!USE_MOCK) return call(`/api/mails/${id}/send`, postJson(payload))
    mockMails = mockMails.map((m) => (m.id === id ? { ...m, sent: true } : m))
    return delay({ ok: true }, 300)
  },

  // ---------- 신청 내역 ----------
  getApplications: () => (USE_MOCK ? delay([...mockApps], 200) : call('/api/applications')),

  getDocuments: (applicationId) =>
    USE_MOCK ? delay(mockDocs[applicationId] ?? []) : call(`/api/applications/${applicationId}/documents`),

  getFieldCatalog: () => (USE_MOCK ? delay(fieldCatalog, 0) : call('/api/field-catalog')),

  // ---------- 서류 접수 ----------
  // onStep(i): 처리 단계를 화면에 알려준다. 실제 백엔드는 응답 한 번으로 끝나므로 첫 단계만 알린다.
  submitApplication: async (file, onStep) => {
    if (!USE_MOCK) {
      onStep?.(0)
      const form = new FormData()
      form.append('file', file)
      return call('/api/applications', { method: 'POST', body: form })
    }
    for (let i = 0; i < 4; i++) {
      onStep?.(i)
      await delay(null, 700)
    }
    return mockReview(file)
  },
}

// ---------- 메뉴 배지 ----------
export async function getBadgeCounts() {
  const [mails, apps] = await Promise.all([api.getMails(), api.getApplications()])
  return {
    mail: mails.filter((m) => DECISION[m.decision]?.canSend && !m.sent).length,
    applications: apps.filter((a) => !a.is_stored && a.decision !== '반려').length,
  }
}
