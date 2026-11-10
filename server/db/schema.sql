-- banking-doc-agent PostgreSQL 스키마 (v4)
-- 실행: npm run db:migrate
--
-- loan_applications : 워크플로우 1 실행 결과 전부(통과·반려 모두) → 신청 목록 화면
-- customers         : 통과한 신청자
-- documents         : 통과한 신청 건의 서류별 Extract 결과
-- field_catalog     : 서류·필드별 민감도와 위험 그룹 (워크플로우 2 위험도 계산 기준, DB에서 수정)
-- data_requests     : 외부 요청과 반출 판단·회신 기록

-- ─────────────────────────────────────────────
-- 1. 고객: 통과한 신청자 1명 = 1행
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  applicant_id    TEXT        PRIMARY KEY,            -- 대출신청서의 applicant_id
  name            TEXT        NOT NULL,
  birth_date      DATE        NOT NULL,
  applicant_type  TEXT        NOT NULL CHECK (applicant_type IN ('EMP','BUS')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. 신청 건: 워크플로우 1 실행 1번(PDF 1개) = 1행. 반려 건도 저장한다.
--    반려 건은 고유번호·이름이 비어 있을 수 있으므로 customers를 외래키로 강제하지 않는다.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_applications (
  id                 BIGSERIAL   PRIMARY KEY,
  job_id             TEXT        NOT NULL UNIQUE,     -- Upstage 실행 번호 (재저장 시 중복 방지)
  source_file_name   TEXT,
  applicant_id       TEXT,                            -- 통과 건이면 customers.applicant_id와 같음
  applicant_name     TEXT,
  birth_date         DATE,
  applicant_type     TEXT        NOT NULL CHECK (applicant_type IN ('EMP','BUS','NONE')),
  decision           TEXT        NOT NULL CHECK (decision IN ('처리 완료','검토 필요','서류 누락')),
  is_stored          BOOLEAN     NOT NULL DEFAULT false,  -- 서류를 documents에 저장했는지(=통과)
  reject_reasons     TEXT[]      NOT NULL DEFAULT '{}',   -- 저장하지 않은 이유(코드 검사 결과)
  reason             TEXT,                            -- 워크플로우가 쓴 판정 사유
  issue_codes        TEXT[]      NOT NULL DEFAULT '{}',
  missing_documents  TEXT[]      NOT NULL DEFAULT '{}',
  document_types     TEXT[]      NOT NULL DEFAULT '{}',   -- 제출된 서류 종류
  review_detail      JSONB,                           -- 반려 사유 상세(validation, cross_check). 통과 건은 NULL
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_list ON loan_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON loan_applications (applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_decision ON loan_applications (decision);

-- ─────────────────────────────────────────────
-- 3. 서류: 통과한 신청 건의 서류 1장 = 1행
--    fields = Extract 결과(additional_values) 통째로. 주민번호·면허번호는 저장 시 마스킹.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id              BIGSERIAL   PRIMARY KEY,
  application_id  BIGINT      NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  applicant_id    TEXT        NOT NULL REFERENCES customers(applicant_id) ON DELETE CASCADE,
  doc_index       INT         NOT NULL,
  doc_type        TEXT        NOT NULL,
  page_start      INT,
  page_end        INT,
  fields          JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id, doc_index)
);
CREATE INDEX IF NOT EXISTS idx_documents_applicant_type ON documents (applicant_id, doc_type);

-- ─────────────────────────────────────────────
-- 4. 필드 카탈로그: 서류 종류 × 필드 = 1행. 위험도 기준을 여기서 수정한다.
--    field_path 표기: 일반 필드 'name', 배열 안 필드 'loans[].balance'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_catalog (
  doc_type     TEXT        NOT NULL,
  field_path   TEXT        NOT NULL,
  sensitivity  SMALLINT    NOT NULL CHECK (sensitivity BETWEEN 0 AND 5),  -- 0 = 위험도 계산 제외
  risk_group   TEXT        CHECK (risk_group IN ('ID','FIN','BIZ')),     -- 조합 위험 그룹
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_type, field_path)
);

-- ─────────────────────────────────────────────
-- 5. 정보 요청: 외부사 메일 1통 = 1행
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_requests (
  id                 BIGSERIAL   PRIMARY KEY,
  gmail_message_id   TEXT        UNIQUE,
  requester_company  TEXT,
  requester_email    TEXT,
  mail_subject       TEXT,                            -- 메일 제목 원문
  mail_body          TEXT,                            -- 메일 본문 원문(텍스트)
  mail_received_at   TIMESTAMPTZ,                     -- 메일 수신 시각(Gmail 기준)
  applicant_id       TEXT        REFERENCES customers(applicant_id) ON DELETE SET NULL,
  target_name        TEXT,                            -- 메일에 적힌 대상 고객 이름(워크플로우 2 target_name)
  request_reason     TEXT,
  requested_fields   TEXT[]      NOT NULL DEFAULT '{}',
  risk_score         INT         CHECK (risk_score BETWEEN 0 AND 100),
  risk_level         TEXT        CHECK (risk_level IN ('낮음','보통','높음','매우 높음')),
  decision           TEXT,
  masking_fields     TEXT[]      NOT NULL DEFAULT '{}',
  reason_codes       TEXT[]      NOT NULL DEFAULT '{}',
  missing_items      TEXT[]      NOT NULL DEFAULT '{}',
  masking            JSONB,                           -- {"provided": [...], "masked": [{"field", "mask_type"}]}
  reply_draft        TEXT,                            -- 워크플로우 2가 쓴 회신 초안
  is_starred         BOOLEAN     NOT NULL DEFAULT false,  -- 수신함 별(중요) 표시
  response_payload   JSONB,                           -- 실제로 회신한 내용(마스킹 후)
  status             TEXT        NOT NULL DEFAULT 'analyzed'
                     CHECK (status IN ('analyzed','responded','rejected','failed')),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_requests_applicant ON data_requests (applicant_id, received_at DESC);

