// 서류·필드 라벨, 민감도 조회, 마스킹, 값 포맷
// 백엔드가 붙으면 FIELD_LABELS·민감도는 field_catalog 응답으로 대체하면 됩니다.

export const DOC_LABELS = {
  drivers_license: '운전면허증',
  resident_registration_certificate: '주민등록등본',
  loan_application: '대출신청서',
  financial_transaction_certificate: '금융거래확인서',
  income_verification_certificate: '소득금액증명원',
  employment_certificate: '재직증명서',
};

export const APPLICANT_TYPES = { EMP: '급여소득자', BUS: '사업자', NONE: '확인 불가' };
export const RISK_GROUPS = { ID: '신원', FIN: '금융', BIZ: '직장·사업' };

export const FIELD_LABELS = {
  issue_date: '발급일', issuer: '발급기관', name: '성명', rrn: '주민등록번호', birth_date: '생년월일',
  address: '주소', license_renewal_start: '적성검사 시작', license_renewal_end: '적성검사 종료',
  license_no: '면허번호', household_head_name: '세대주', move_in_date: '전입일', household_members: '세대원',
  relation_to_head: '세대주와의 관계', change_reason: '변동사유', branch: '신청지점', work_address: '직장 주소',
  phone_mobile: '휴대전화', phone_work: '직장 전화', email: '이메일', occupation_type: '직업군',
  applicant_id: '신청자 번호', employment_finance: '직장·재무 정보', company_name: '회사명',
  business_reg_no: '사업자등록번호', department: '부서', position: '직위', job_duty: '담당업무',
  hire_date: '입사일', monthly_income: '월소득', housing_tenure: '주거형태', housing_type: '주택유형',
  has_other_loans: '타대출 유무', other_loan_total: '타대출 총액', other_secured_loan_total: '타 담보대출 총액',
  loan_details: '대출 신청 내용', loan_amount: '신청금액', loan_term_months: '대출기간(개월)',
  repayment_method: '상환방법', desired_loan_date: '희망대출일', loan_purpose: '대출목적',
  doc_no: '문서번호', base_date: '기준일', confirm_date: '확인일', loans: '대출 내역', loan_type: '대출종류',
  interest_rate: '금리(%)', loan_start_date: '대출일', original_amount: '대출원금', balance: '잔액',
  maturity_date: '만기일', collaterals: '담보 내역', collateral_owner: '담보 소유자', owner_relation: '관계',
  collateral_type: '담보종류', appraisal_value: '감정가', appraisal_date: '감정일', lien_rank: '설정순위',
  lien_amount: '설정금액', delinquencies: '연체 내역', application_date: '신청일', annual_income: '연소득',
  income_earner_type: '소득자 구분', income_year: '귀속연도', income_category: '소득구분',
  is_currently_employed: '재직 여부', purpose: '용도',
  // 워크플로우 검증 항목(check) 이름
  document_freshness: '발급 유효기간', license_renewal_period_order: '적성검사 기간 순서',
  transaction_subject: '거래 주체', loans_amount_total: '대출 잔액 합계',
  hire_date_vs_issue_date: '입사일과 발급일 순서', other_loans_relation: '타대출 금액 관계',
};

// field_path 의 마지막 키로 라벨 찾기 ("loans[].balance" → "잔액")
// "income_verification_certificate:annual_income" 처럼 서류 접두어가 붙어도 처리
export const leafKey = (path) => path.split(':').pop().split('.').pop().replace('[]', '');
export const fieldLabel = (path) => FIELD_LABELS[leafKey(path)] ?? path;

// DB에 해시로 저장되는 필드 → 화면에서는 항상 마스킹된 값만 보여줌
const HASHED = new Set(['rrn', 'license_no']);
export const isHashed = (path) => HASHED.has(leafKey(path));

export function maskValue(path, value) {
  if (!isHashed(path) || typeof value !== 'string') return value;
  if (leafKey(path) === 'rrn') return value.replace(/^(\d{6}-?\d)\d*/, (_, a) => `${a}******`);
  return value.replace(/\d(?=[\d-]{4})/g, '•');
}

export function formatValue(v) {
  if (v === true) return '예';
  if (v === false) return '아니오';
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && Math.abs(v) >= 1000) return v.toLocaleString('ko-KR');
  return String(v);
}

// field_catalog 에서 민감도 찾기. docType 없으면 같은 field_path 중 가장 높은 값.
export function lookupField(catalog, path, docType) {
  const p = path.includes(':') ? path.split(':')[1] : path;
  const d = path.includes(':') ? path.split(':')[0] : docType;
  const rows = catalog.filter((c) => c.field_path === p && (!d || c.doc_type === d));
  if (rows.length === 0) return { sensitivity: 0, risk_group: 'FIN', field_path: p, doc_type: d };
  return rows.reduce((a, b) => (b.sensitivity > a.sensitivity ? b : a));
}
