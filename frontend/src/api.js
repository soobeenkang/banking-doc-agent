// 데이터 계층. 기본은 목업 데이터로 동작하고, VITE_USE_MOCK=false 이면 FastAPI를 호출한다.
// 메일(자료 제공 요청)은 워크플로우 2 백엔드가 붙기 전까지 항상 목업을 쓴다.
//
// 백엔드 엔드포인트 (server/app/main.py)
//   GET  /api/applications                  -> LoanApplication[]    (ERD loan_applications)
//   GET  /api/applications/{id}             -> LoanApplication      (+ documents)
//   GET  /api/applications/{id}/documents   -> Document[]           (ERD documents, 통과 건만 존재)
//   GET  /api/field-catalog                 -> FieldCatalog[]       (ERD field_catalog)
//   POST /api/applications                  -> Task (202)           multipart/form-data, 필드명 file (워크플로우 1 백그라운드 실행)
//   GET  /api/tasks/{task_id}               -> Task                 status: queued → running → saving → done | failed
//
// 아직 백엔드 없음 (목업)
//   GET  /api/mails                         -> Mail[]               (src/data/mails.js 형태 + sent: boolean)
//   POST /api/mails/{id}/send               -> { ok: true }         body: { reply, attachments: string[] }

import { MAILS } from './data/mails.js'
import { DECISION } from './lib/format.js'
import sample from './mock/sample-w1.json'
import { documents, fieldCatalog, loanApplications, makeDocuments } from './mock/data.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const delay = (value, ms = 120) => new Promise((resolve) => setTimeout(() => resolve(value), ms))

async function call(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(typeof body.detail === 'string' ? body.detail : `요청 실패 (${res.status})`)
    err.status = res.status
    throw err
  }
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
const mockTasks = {} // task_id -> { task, file, startedAt }

const now = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 워크플로우 1 결과 흉내: 60%는 통과, 나머지는 재직증명서 누락(서류 누락)
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
        ...base, decision: '서류 누락', is_stored: false, reject_reasons: ['재직증명서 누락'],
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
  // 백엔드가 없어 항상 목업. 백엔드가 생기면 call('/api/mails'), call(`/api/mails/${id}/send`, postJson(payload)) 로 바꾼다.
  getMails: () => delay(structuredClone(mockMails)),

  // 별(중요) 표시. 실제 메일이 붙으면 call(`/api/requests/${id}`, { method: 'PATCH', ...json({ is_starred }) }) 로 바꾼다.
  starMail: (id, starred) => {
    mockMails = mockMails.map((m) => (m.id === id ? { ...m, starred } : m))
    return delay({ id, is_starred: starred }, 80)
  },

  sendMail: (id) => {
    mockMails = mockMails.map((m) => (m.id === id ? { ...m, sent: true } : m))
    return delay({ ok: true }, 300)
  },

  // ---------- 신청 내역 ----------
  getApplications: () => (USE_MOCK ? delay([...mockApps], 200) : call('/api/applications')),

  getDocuments: (applicationId) =>
    USE_MOCK ? delay(mockDocs[applicationId] ?? []) : call(`/api/applications/${applicationId}/documents`),

  getApplication: (id) => {
    if (!USE_MOCK) return call(`/api/applications/${id}`)
    const app = mockApps.find((a) => a.id === id)
    return app ? delay({ ...app }) : Promise.reject(Object.assign(new Error('신청을 찾을 수 없습니다'), { status: 404 }))
  },

  getFieldCatalog: () => (USE_MOCK ? delay(fieldCatalog, 0) : call('/api/field-catalog')),

  // ---------- 서류 접수 ----------
  // 업로드하면 바로 task 를 돌려주고, 워크플로우 1은 서버 백그라운드에서 돈다(약 1분 이상).
  submitApplication: (file) => {
    if (!USE_MOCK) {
      const form = new FormData()
      form.append('file', file)
      return call('/api/applications', { method: 'POST', body: form })
    }
    const task_id = Math.random().toString(36).slice(2, 14)
    const task = { task_id, file_name: file.name, status: 'queued' }
    mockTasks[task_id] = { task, file, startedAt: Date.now() }
    return delay({ ...task }, 300)
  },

  // 처리 상태 조회. 서버를 재시작하면 task 가 사라져 404 가 난다.
  getTask: (taskId) => {
    if (!USE_MOCK) return call(`/api/tasks/${taskId}`)
    const t = mockTasks[taskId]
    if (!t) return Promise.reject(Object.assign(new Error('task not found'), { status: 404 }))
    const sec = (Date.now() - t.startedAt) / 1000
    if (t.task.status !== 'done') {
      if (sec > 9) {
        const app = mockReview(t.file)
        t.task = { ...t.task, status: 'done', application_id: app.id, stored: app.is_stored }
      } else {
        t.task = { ...t.task, status: sec > 7 ? 'saving' : sec > 1.5 ? 'running' : 'queued' }
      }
    }
    return delay({ ...t.task })
  },
}

// ---------- 메뉴 배지 ----------
export async function getBadgeCounts() {
  const [mails, apps] = await Promise.all([api.getMails(), api.getApplications()])
  return {
    mail: mails.filter((m) => DECISION[m.decision]?.canSend && !m.sent).length,
    applications: apps.filter((a) => !a.is_stored).length,
  }
}
