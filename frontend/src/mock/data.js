// ERD 기준 목업 데이터 (loan_applications, documents, data_requests, field_catalog)
// 실제 워크플로우 1 결과(sample-w1.json)를 바탕으로 만들었습니다.
import sample from './sample-w1.json';

const clone = (x) => structuredClone(x);

// ---------- field_catalog ----------
const SENS = {
  rrn: 5, license_no: 4, annual_income: 4, monthly_income: 4, balance: 4, other_loan_total: 4,
  other_secured_loan_total: 4, birth_date: 3, address: 3, phone_mobile: 3, original_amount: 3,
  interest_rate: 3, loan_amount: 3, appraisal_value: 3, lien_amount: 3, collateral_type: 3,
  name: 2, email: 2, phone_work: 2, work_address: 2, business_reg_no: 2, hire_date: 2,
  household_head_name: 2, relation_to_head: 2, loan_purpose: 2, move_in_date: 2,
  issue_date: 0, issuer: 0, base_date: 0, confirm_date: 0, application_date: 0, purpose: 0,
};
const ID_KEYS = new Set(['rrn', 'license_no', 'name', 'birth_date', 'address', 'phone_mobile', 'email',
  'household_head_name', 'relation_to_head', 'move_in_date', 'change_reason', 'license_renewal_start', 'license_renewal_end']);
const BIZ_KEYS = new Set(['company_name', 'business_reg_no', 'department', 'position', 'job_duty', 'hire_date',
  'work_address', 'phone_work', 'is_currently_employed', 'occupation_type']);

function catalogFrom(docs) {
  const rows = [];
  const add = (doc_type, field_path, key) =>
    rows.push({
      doc_type,
      field_path,
      sensitivity: SENS[key] ?? 1,
      risk_group: ID_KEYS.has(key) ? 'ID' : BIZ_KEYS.has(key) ? 'BIZ' : 'FIN',
      description: '',
    });
  docs.forEach((d) =>
    Object.entries(d.additional_values).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        const first = v[0] ?? {};
        Object.keys(first).forEach((sub) => add(d.text, `${k}[].${sub}`, sub));
      } else add(d.text, k, k);
    })
  );
  return rows;
}
export const fieldCatalog = catalogFrom(sample.documents);

// ---------- documents (통과 건만) ----------
const PAGES = [[1, 1], [2, 3], [4, 6], [7, 8], [9, 9], [10, 10]];

function personalize(fields, p) {
  const f = clone(fields);
  if ('name' in f) f.name = p.name;
  if ('birth_date' in f) f.birth_date = p.birth;
  if ('rrn' in f) f.rrn = p.rrn;
  if ('applicant_id' in f) f.applicant_id = p.id;
  if (f.household_members) f.household_members = f.household_members.map((m) => ({ ...m, name: p.name, rrn: p.rrn }));
  if (f.household_head_name) f.household_head_name = p.name;
  if (f.collaterals) f.collaterals = f.collaterals.map((c) => ({ ...c, collateral_owner: p.name }));
  return f;
}

export function makeDocuments(applicationId, person, docTypes) {
  return sample.documents
    .filter((d) => !docTypes || docTypes.includes(d.text))
    .map((d, i) => ({
      id: applicationId * 100 + i,
      application_id: applicationId,
      applicant_id: person.id,
      doc_index: i,
      doc_type: d.text,
      page_start: PAGES[i][0],
      page_end: PAGES[i][1],
      fields: personalize(d.additional_values, person),
    }));
}

// ---------- loan_applications ----------
const P = {
  doyoon: { id: 'TEST-2026-0001', name: '김도윤', birth: '1997-03-15', rrn: '970315-1000000', type: 'EMP' },
  seoyeon: { id: 'TEST-2026-0002', name: '이서연', birth: '1993-08-02', rrn: '930802-2000000', type: 'BUS' },
  junho: { id: 'TEST-2026-0003', name: '박준호', birth: '1989-12-21', rrn: '891221-1000000', type: 'EMP' },
  minji: { id: 'TEST-2026-0004', name: '최민지', birth: '1995-05-30', rrn: '950530-2000000', type: 'EMP' },
  hyunwoo: { id: 'TEST-2026-0005', name: '정현우', birth: '1991-01-09', rrn: '910109-1000000', type: 'EMP' },
};

const ALL_TYPES = sample.document_types;

function passed(id, p, at, file) {
  return {
    id, job_id: `job_${id}X${p.id.slice(-4)}`, source_file_name: file, created_at: at,
    applicant_id: p.id, applicant_name: p.name, birth_date: p.birth, applicant_type: p.type,
    decision: '처리 완료', is_stored: true, reject_reasons: [], reason: sample.reason,
    issue_codes: [], missing_documents: [], document_types: ALL_TYPES, review_detail: null,
  };
}

export const loanApplications = [
  {
    id: 106, job_id: 'job_106Q7mXcPz', source_file_name: 'scan_20261108_1402.pdf', created_at: '2026-11-08 14:02',
    applicant_id: null, applicant_name: null, birth_date: null, applicant_type: 'NONE',
    decision: '서류 누락', is_stored: false,
    reject_reasons: ['신청자 식별 불가', '대출신청서 누락'],
    reason: '대출신청서가 없어 신청자 번호를 확인할 수 없고, 운전면허증과 주민등록등본의 성명이 서로 다릅니다.',
    issue_codes: ['APPLICANT_NOT_FOUND', 'NAME_MISMATCH'],
    missing_documents: ['loan_application'],
    document_types: ['drivers_license', 'resident_registration_certificate'],
    review_detail: {
      failed_checks: [
        { doc_type: 'resident_registration_certificate', check: 'name', issue_code: 'NAME_MISMATCH', reason: '등본 성명(정현우)과 면허증 성명(정형우)이 다릅니다.' },
        { doc_type: 'drivers_license', check: 'issue_date', issue_code: 'UNREADABLE', reason: '발급일을 읽을 수 없습니다. 스캔 해상도가 낮습니다.' },
      ],
      cross_check: [],
    },
  },
  {
    id: 105, job_id: 'job_105Lk2RtVb', source_file_name: '최민지_대출서류.pdf', created_at: '2026-11-08 13:20',
    applicant_id: P.minji.id, applicant_name: P.minji.name, birth_date: P.minji.birth, applicant_type: 'EMP',
    decision: '서류 누락', is_stored: false,
    reject_reasons: ['재직증명서 누락', '주민등록등본 유효기간 초과'],
    reason: '재직증명서가 제출되지 않았고, 주민등록등본이 기준일보다 90일 이상 전에 발급되었습니다. 나머지 서류 간 불일치는 없습니다.',
    issue_codes: ['DOC_MISSING', 'DOC_EXPIRED'],
    missing_documents: ['employment_certificate'],
    document_types: ALL_TYPES.filter((t) => t !== 'employment_certificate'),
    review_detail: {
      failed_checks: [
        { doc_type: 'resident_registration_certificate', check: 'document_freshness', issue_code: 'DOC_EXPIRED', reason: '기준일 대비 90일을 넘긴 문서입니다. (발급일 2026-07-21)' },
      ],
      cross_check: [
        { field: 'company_name', reason: '대출신청서의 회사명을 대조할 재직증명서가 없습니다.' },
      ],
    },
  },
  passed(104, P.junho, '2026-11-08 11:47', '박준호_서류일체.pdf'),
  {
    id: 103, job_id: 'job_103Hs8WnQe', source_file_name: '이서연_사업자.pdf', created_at: '2026-11-08 10:55',
    applicant_id: P.seoyeon.id, applicant_name: P.seoyeon.name, birth_date: P.seoyeon.birth, applicant_type: 'BUS',
    decision: '검토 필요', is_stored: false,
    reject_reasons: ['소득 금액 불일치'],
    reason: '대출신청서의 월소득으로 계산한 연소득과 소득금액증명원의 연소득 차이가 20%를 넘습니다.',
    issue_codes: ['INCOME_MISMATCH'],
    missing_documents: [],
    document_types: ALL_TYPES,
    review_detail: {
      failed_checks: [],
      cross_check: [
        { field: 'annual_income', reason: '신청서 월소득 520만 원(연 6,240만 원) / 증명원 연소득 4,560만 원' },
      ],
    },
  },
  passed(102, P.hyunwoo, '2026-11-07 16:31', '정현우_대출신청.pdf'),
  passed(101, P.doyoon, '2026-11-07 15:08', 'iM4_set01.pdf'),
];

export const documents = Object.fromEntries(
  loanApplications
    .filter((a) => a.is_stored)
    .map((a) => {
      const p = Object.values(P).find((x) => x.id === a.applicant_id);
      return [a.id, makeDocuments(a.id, p)];
    })
);
export const people = P;

// ---------- data_requests ----------
export const dataRequests = [
  {
    id: 3007, gmail_message_id: '18f2a9c0e7d1b001', received_at: '2026-11-08 15:12',
    requester_company: '한빛캐피탈', requester_email: 'credit@hanbit-capital.example.com',
    applicant_id: P.doyoon.id,
    request_reason: '전세자금 대출 심사를 위해 김도윤 님의 소득과 재직 정보를 요청드립니다. 고객 동의서는 첨부했습니다.',
    requested_fields: [
      'income_verification_certificate:annual_income',
      'employment_certificate:company_name',
      'employment_certificate:hire_date',
      'resident_registration_certificate:rrn',
    ],
    risk_score: 58, risk_level: 'MEDIUM', decision: '부분 공개',
    masking_fields: ['resident_registration_certificate:rrn'],
    reason_codes: ['PURPOSE_MATCH', 'RRN_NOT_NEEDED'],
    missing_items: [],
    response_payload: {
      fields: {
        'income_verification_certificate:annual_income': 45600000,
        'employment_certificate:company_name': '주식회사 넥스트코드',
        'employment_certificate:hire_date': '2022년 03월 02일',
        'resident_registration_certificate:rrn': '970315-1******',
      },
      message: '요청하신 소득·재직 정보를 회신드립니다. 주민등록번호는 심사 목적에 필요하지 않아 가려서 드립니다.',
    },
    status: '대기',
  },
  {
    id: 3006, gmail_message_id: '18f2a7b1c4e9a002', received_at: '2026-11-08 12:40',
    requester_company: '스카이렌탈', requester_email: 'ops@skyrental.example.com',
    applicant_id: P.junho.id,
    request_reason: '박준호 고객의 전체 대출 내역과 담보, 연체 기록 일체를 보내 주세요.',
    requested_fields: [
      'financial_transaction_certificate:loans[].balance',
      'financial_transaction_certificate:collaterals[].appraisal_value',
      'financial_transaction_certificate:delinquencies',
      'drivers_license:license_no',
      'resident_registration_certificate:rrn',
    ],
    risk_score: 87, risk_level: 'HIGH', decision: '공개 불가',
    masking_fields: [],
    reason_codes: ['NO_CONSENT', 'PURPOSE_UNCLEAR', 'EXCESSIVE_SCOPE'],
    missing_items: [],
    response_payload: {
      fields: {},
      message: '요청 목적과 고객 동의가 확인되지 않아 정보를 제공할 수 없습니다. 고객 동의서와 이용 목적을 첨부해 다시 요청해 주세요.',
    },
    status: '대기',
  },
  {
    id: 3005, gmail_message_id: '18f29e33a0b7c003', received_at: '2026-11-08 09:05',
    requester_company: '누리저축은행', requester_email: 'loan@nuri-sb.example.com',
    applicant_id: P.hyunwoo.id,
    request_reason: '정현우 님의 사업자등록번호와 재직 여부 확인을 요청합니다.',
    requested_fields: [
      'employment_certificate:is_currently_employed',
      'loan_application:employment_finance[].business_reg_no',
      'loan_application:employment_finance[].job_duty',
    ],
    risk_score: 34, risk_level: 'LOW', decision: '공개',
    masking_fields: [],
    reason_codes: ['PURPOSE_MATCH', 'CONSENT_ATTACHED'],
    missing_items: ['loan_application:employment_finance[].job_duty'],
    response_payload: {
      fields: {
        'employment_certificate:is_currently_employed': true,
        'loan_application:employment_finance[].business_reg_no': '000-00-00002',
      },
      message: '재직 여부와 사업자등록번호를 회신드립니다. 담당업무는 보관 중인 서류에 없습니다.',
    },
    status: '회신 완료',
  },
  {
    id: 3004, gmail_message_id: '18f28c11d2a6e004', received_at: '2026-11-07 17:22',
    requester_company: '한빛캐피탈', requester_email: 'credit@hanbit-capital.example.com',
    applicant_id: P.doyoon.id,
    request_reason: '기존 대출 잔액 확인 요청드립니다.',
    requested_fields: ['financial_transaction_certificate:loans[].balance'],
    risk_score: 41, risk_level: 'MEDIUM', decision: '공개',
    masking_fields: [], reason_codes: ['PURPOSE_MATCH', 'CONSENT_ATTACHED'], missing_items: [],
    response_payload: {
      fields: { 'financial_transaction_certificate:loans[].balance': [9000000, 3000000] },
      message: '보관 중인 대출 잔액 2건을 회신드립니다.',
    },
    status: '회신 완료',
  },
];
