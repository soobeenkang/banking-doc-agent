// 화면이 쓰는 데이터 함수 모음.
// 지금은 목업 데이터로 동작합니다. 백엔드가 준비되면 각 함수 안을 fetch 호출로 바꾸면 되고,
// 반환 모양은 ERD의 테이블 칼럼 그대로입니다.
import sample from './mock/sample-w1.json';
import { dataRequests, documents, fieldCatalog, loanApplications, makeDocuments } from './mock/data.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let apps = [...loanApplications];
let docs = { ...documents };
let reqs = [...dataRequests];

const now = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// GET /field-catalog
export async function getFieldCatalog() {
  return fieldCatalog;
}

// GET /loan-applications
export async function getApplications() {
  await wait(250);
  return [...apps];
}

// GET /loan-applications/:id/documents  (통과 건만 존재)
export async function getDocuments(applicationId) {
  await wait(150);
  return docs[applicationId] ?? [];
}

// POST /loan-applications  (PDF 업로드 → 워크플로우 1)
// onStep(i) 로 처리 단계를 화면에 알려줌
export async function submitApplication(file, onStep) {
  for (let i = 0; i < 4; i++) {
    onStep?.(i);
    await wait(700);
  }
  const id = Math.max(...apps.map((a) => a.id)) + 1;
  const ok = Math.random() < 0.6;
  const person = { id: `TEST-2026-${String(id).padStart(4, '0')}`, name: '김도윤', birth: '1997-03-15', rrn: '970315-1000000' };
  const app = ok
    ? {
        id, job_id: `job_${id}${Math.random().toString(36).slice(2, 10)}`, source_file_name: file.name, created_at: now(),
        applicant_id: person.id, applicant_name: person.name, birth_date: person.birth, applicant_type: 'EMP',
        decision: '처리 완료', is_stored: true, reject_reasons: [], reason: sample.reason,
        issue_codes: [], missing_documents: [], document_types: sample.document_types, review_detail: null,
      }
    : {
        id, job_id: `job_${id}${Math.random().toString(36).slice(2, 10)}`, source_file_name: file.name, created_at: now(),
        applicant_id: person.id, applicant_name: person.name, birth_date: person.birth, applicant_type: 'EMP',
        decision: '보완 필요', is_stored: false, reject_reasons: ['재직증명서 누락'],
        reason: '재직증명서가 없어 대출신청서의 직장 정보를 대조할 수 없습니다.',
        issue_codes: ['DOC_MISSING'], missing_documents: ['employment_certificate'],
        document_types: sample.document_types.filter((t) => t !== 'employment_certificate'),
        review_detail: { failed_checks: [], cross_check: [{ field: 'company_name', reason: '대조할 재직증명서가 없습니다.' }] },
      };
  apps = [app, ...apps];
  if (ok) docs[id] = makeDocuments(id, person);
  return app;
}

// GET /data-requests
export async function getRequests() {
  await wait(250);
  return [...reqs];
}

// PATCH /data-requests/:id
export async function updateRequest(id, patch) {
  await wait(300);
  reqs = reqs.map((r) => (r.id === id ? { ...r, ...patch } : r));
  return reqs.find((r) => r.id === id);
}
