"""DB 저장·조회 로직 (워크플로우 1 결과 저장, 워크플로우 2용 조회·기록)."""

import json
import re
from datetime import date

from psycopg.types.json import Jsonb

from .db import pool

ALLOWED_DECISIONS = ("처리 완료", "검토 필요", "서류 누락")

##################################################
# 결과 정규화
##################################################


def normalize_result(raw) -> tuple[dict, dict]:
    """워크플로우 결과를 (결과 객체, 메타데이터)로 정리한다.

    - API(agent_client.parse_result) 결과: 결과 객체 그대로
    - Studio 화면에서 복사한 결과: {"content": "<JSON 문자열>", "metadata": {...}}
    """
    if isinstance(raw, str):
        raw = json.loads(raw)
    meta = {}
    if isinstance(raw, dict) and "content" in raw and "documents" not in raw:
        meta = raw.get("metadata") or {}
        raw = raw["content"]
    if isinstance(raw, str):
        s = re.sub(r"^\s*```(?:json)?|```\s*$", "", raw)
        raw = json.loads(s[s.index("{"): s.rindex("}") + 1])
    return raw, meta


def pages_from_meta(meta: dict) -> list:
    return [(it.get("page_ranges") or [[None, None]])[0] for it in (meta.get("merge") or {}).get("items", [])]


##################################################
# 값 정리
##################################################

_DATE_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})")


def to_date(v) -> date | None:
    """'2026년 11월 04일', '2021. 04. 19.', '2024.03.15', '1997-03-15' → date"""
    if not isinstance(v, str):
        return None
    m = _DATE_RE.search(v)
    if not m:
        return None
    try:
        return date(int(m[1]), int(m[2]), int(m[3]))
    except ValueError:
        return None


# 저장 시 항상 가리는 값 (중첩 배열 안까지 적용)
_MASKERS = {
    "rrn": lambda v: re.sub(r"^(\d{6})-?(\d)\d{6}$", r"\1-\2******", str(v)),
    "license_no": lambda v: re.sub(r"^(\d{2}-\d{2})-.*$", r"\1-******-**", str(v)),
}


def mask_fields(value):
    if isinstance(value, list):
        return [mask_fields(v) for v in value]
    if isinstance(value, dict):
        return {k: (_MASKERS[k](v) if k in _MASKERS and v else mask_fields(v)) for k, v in value.items()}
    return value


_CITATION_RE = re.compile(r"\s*【[^】]*】|\s*\[\s*[†+]\s*\d+(?:\s*[,†+]\s*\d+)*\s*\]")


def strip_citations(v):
    """LLM이 붙인 출처 표시(【†1】, [†2] 등)를 지운다."""
    return _CITATION_RE.sub("", v).strip() if isinstance(v, str) else v


def present_fields(obj: dict, prefix: str = "") -> list[str]:
    """값이 실제로 있는 필드 경로. 빈 문자열·None·빈 배열 제외, 0과 False는 값으로 본다.
    예: {'name': '김도윤', 'loans': [{'balance': 9000000}], 'delinquencies': []} → ['name', 'loans[].balance']
    """
    out: list[str] = []

    def add(p):
        if p not in out:
            out.append(p)

    for k, v in (obj or {}).items():
        path = f"{prefix}.{k}" if prefix else k
        if isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    for p in present_fields(item, f"{path}[]"):
                        add(p)
                elif item not in (None, ""):
                    add(path)
        elif isinstance(v, dict):
            for p in present_fields(v, path):
                add(p)
        elif v is not None and str(v).strip() != "":
            add(path)
    return out


##################################################
# 워크플로우 1 저장
##################################################


def check_storable(r: dict, job_id: str | None) -> list[str]:
    """서류를 저장할 수 없는 이유 목록. 비어 있으면 통과."""
    loan_app = next((d for d in r.get("documents") or [] if d.get("text") == "loan_application"), {})
    why = []
    if r.get("decision") != "처리 완료":
        why.append(f"decision={r.get('decision')}")
    if r.get("issue_codes"):
        why.append("issue_codes=" + ",".join(r["issue_codes"]))
    if r.get("missing_documents"):
        why.append("missing_documents=" + ",".join(r["missing_documents"]))
    if r.get("applicant_type") not in ("EMP", "BUS"):
        why.append(f"applicant_type={r.get('applicant_type')}")
    if not r.get("applicant_id"):
        why.append("applicant_id 없음")
    if not r.get("applicant_name"):
        why.append("applicant_name 없음")
    if not to_date((loan_app.get("additional_values") or {}).get("birth_date")):
        why.append("대출신청서 birth_date 없음")
    if not r.get("documents"):
        why.append("documents 없음")
    if not job_id:
        why.append("job_id 없음")
    return why


def save_workflow1(raw, job_id: str | None = None, file_name: str | None = None) -> dict:
    """모든 실행 결과를 loan_applications에 남기고, 통과한 건만 customers / documents에 저장한다."""
    r, meta = normalize_result(raw)
    job_id = job_id or meta.get("job_execution_id")
    if not job_id:
        raise ValueError("job_id가 없습니다")
    file_name = r.get("file") or file_name or ((meta.get("source_files") or [{}])[0].get("file_name"))
    pages = pages_from_meta(meta)
    docs = r.get("documents") or []
    loan_app = next((d for d in docs if d.get("text") == "loan_application"), {})
    birth = to_date((loan_app.get("additional_values") or {}).get("birth_date"))

    reject = check_storable(r, job_id)
    passed = not reject

    with pool.connection() as conn, conn.transaction():
        # 같은 job을 다시 저장하면 기존 신청 건(과 서류)을 지우고 새로 넣는다.
        conn.execute("DELETE FROM loan_applications WHERE job_id = %s", (job_id,))
        app_id = conn.execute(
            """INSERT INTO loan_applications
                 (job_id, source_file_name, applicant_id, applicant_name, birth_date, applicant_type, decision,
                  is_stored, reject_reasons, reason, issue_codes, missing_documents, document_types, review_detail)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id""",
            (
                job_id, file_name, r.get("applicant_id") or None, r.get("applicant_name") or None, birth,
                r.get("applicant_type") if r.get("applicant_type") in ("EMP", "BUS") else "NONE",
                r.get("decision") if r.get("decision") in ALLOWED_DECISIONS else "검토 필요",
                passed, reject, strip_citations(r.get("reason")), r.get("issue_codes") or [], r.get("missing_documents") or [],
                r.get("document_types") or [d.get("text") for d in docs],
                None if passed else Jsonb(mask_fields({"validation": r.get("validation"), "cross_check": r.get("cross_check") or []})),
            ),
        ).fetchone()["id"]

        if passed:
            conn.execute(
                """INSERT INTO customers (applicant_id, name, birth_date, applicant_type)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (applicant_id) DO UPDATE SET
                     name = EXCLUDED.name, birth_date = EXCLUDED.birth_date,
                     applicant_type = EXCLUDED.applicant_type, updated_at = now()""",
                (r["applicant_id"], r["applicant_name"], birth, r["applicant_type"]),
            )
            for i, d in enumerate(docs):
                p_start, p_end = (pages[i] if i < len(pages) else None) or (None, None)
                conn.execute(
                    """INSERT INTO documents (application_id, applicant_id, doc_index, doc_type, page_start, page_end, fields)
                       VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                    (app_id, r["applicant_id"], i, d.get("text"), p_start, p_end, Jsonb(mask_fields(d.get("additional_values") or {}))),
                )

    return {"application_id": app_id, "stored": passed, "reject_reasons": reject, "documents": len(docs) if passed else 0}


##################################################
# 조회 (React 화면용)
##################################################


def list_applications(decision: str | None = None, limit: int = 100) -> list[dict]:
    with pool.connection() as conn:
        return conn.execute(
            """SELECT id, job_id, source_file_name, applicant_id, applicant_name, birth_date, applicant_type,
                      decision, is_stored, reject_reasons, reason, issue_codes, missing_documents, document_types,
                      review_detail, created_at
                 FROM loan_applications
                WHERE %(d)s::text IS NULL OR decision = %(d)s
                ORDER BY created_at DESC LIMIT %(n)s""",
            {"d": decision, "n": limit},
        ).fetchall()


def get_application(application_id: int) -> dict | None:
    with pool.connection() as conn:
        app = conn.execute("SELECT * FROM loan_applications WHERE id = %s", (application_id,)).fetchone()
        if app:
            app["documents"] = conn.execute(
                """SELECT doc_index, doc_type, page_start, page_end, fields
                     FROM documents WHERE application_id = %s ORDER BY doc_index""",
                (application_id,),
            ).fetchall()
        return app


def get_application_documents(application_id: int) -> list[dict]:
    with pool.connection() as conn:
        return conn.execute(
            """SELECT id, application_id, applicant_id, doc_index, doc_type, page_start, page_end, fields
                 FROM documents WHERE application_id = %s ORDER BY doc_index""",
            (application_id,),
        ).fetchall()


def list_field_catalog() -> list[dict]:
    with pool.connection() as conn:
        return conn.execute(
            "SELECT doc_type, field_path, sensitivity, risk_group, description FROM field_catalog ORDER BY doc_type, field_path"
        ).fetchall()


def get_customer(applicant_id: str) -> dict | None:
    with pool.connection() as conn:
        c = conn.execute("SELECT * FROM customers WHERE applicant_id = %s", (applicant_id,)).fetchone()
    if c:
        c["documents"] = get_customer_documents(applicant_id)
    return c


##################################################
# 워크플로우 2용
##################################################


def get_customer_documents(applicant_id: str, doc_types: list[str] | None = None) -> list[dict]:
    """고객의 '가장 최근 통과한 신청 건' 서류. doc_types를 주면 그 서류만."""
    with pool.connection() as conn:
        rows = conn.execute(
            """SELECT d.doc_index, d.doc_type, d.page_start, d.page_end, d.fields
                 FROM documents d
                WHERE d.application_id = (
                        SELECT id FROM loan_applications
                         WHERE applicant_id = %s AND is_stored
                         ORDER BY created_at DESC LIMIT 1)
                  AND (%s::text[] IS NULL OR d.doc_type = ANY(%s::text[]))
                ORDER BY d.doc_index""",
            (applicant_id, doc_types, doc_types),
        ).fetchall()
    for r in rows:
        r["present_fields"] = present_fields(r["fields"])
    return rows


def get_sensitivity_profile(applicant_id: str, doc_types: list[str] | None = None) -> list[dict]:
    """요청된 서류에 실제로 값이 있는 필드와 그 민감도·그룹 (기준은 field_catalog)."""
    docs = get_customer_documents(applicant_id, doc_types)
    with pool.connection() as conn:
        catalog = conn.execute(
            "SELECT doc_type, field_path, sensitivity, risk_group FROM field_catalog WHERE doc_type = ANY(%s)",
            (list({d["doc_type"] for d in docs}),),
        ).fetchall()
    by_key = {(c["doc_type"], c["field_path"]): c for c in catalog}

    out = []
    for d in docs:
        fields, uncataloged = [], []
        for path in d["present_fields"]:
            c = by_key.get((d["doc_type"], path))
            if c is None:
                uncataloged.append(path)
            elif c["sensitivity"] > 0:
                fields.append({"path": path, "sensitivity": c["sensitivity"], "risk_group": c["risk_group"]})
        out.append({
            "doc_type": d["doc_type"],
            "max_sensitivity": max([f["sensitivity"] for f in fields], default=0),
            "groups": {g: [f["path"] for f in fields if f["risk_group"] == g] for g in ("ID", "FIN", "BIZ")},
            "fields": fields,
            "uncataloged": uncataloged,  # 카탈로그에 없는 필드 → field_catalog에 추가 필요
        })
    return out


def save_request(*, gmail_message_id, requester_company, requester_email, request_reason,
                 applicant_id, result: dict, mail_subject=None, mail_body=None, mail_received_at=None) -> dict:
    """워크플로우 2 결과 + 메일 원문 저장 (같은 메일이면 판단 결과를 덮어씀).
    result의 target_name(대상 고객 이름)·mail_body도 받는다. applicant_id가 없으면 target_name으로
    customers에서 이름이 같은 고객이 한 명뿐일 때만 연결한다."""
    target_name = result.get("target_name")
    mail_body = mail_body or result.get("mail_body")
    masking = result.get("masking")
    with pool.connection() as conn:
        if not applicant_id and target_name:
            rows = conn.execute("SELECT applicant_id FROM customers WHERE name = %s LIMIT 2", (target_name,)).fetchall()
            applicant_id = rows[0]["applicant_id"] if len(rows) == 1 else None
        return conn.execute(
            """INSERT INTO data_requests
                 (gmail_message_id, requester_company, requester_email, applicant_id, target_name, request_reason,
                  requested_fields, risk_score, risk_level, decision, masking_fields, reason_codes, missing_items,
                  masking, reply_draft, mail_subject, mail_body, mail_received_at)
               VALUES (%s,%s,%s,(SELECT applicant_id FROM customers WHERE applicant_id = %s),%s,%s,
                       %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (gmail_message_id) DO UPDATE SET
                 applicant_id = EXCLUDED.applicant_id, target_name = EXCLUDED.target_name,
                 requested_fields = EXCLUDED.requested_fields,
                 risk_score = EXCLUDED.risk_score, risk_level = EXCLUDED.risk_level, decision = EXCLUDED.decision,
                 masking_fields = EXCLUDED.masking_fields, reason_codes = EXCLUDED.reason_codes,
                 missing_items = EXCLUDED.missing_items, masking = EXCLUDED.masking,
                 reply_draft = EXCLUDED.reply_draft, status = 'analyzed'
               RETURNING id, applicant_id""",
            (
                gmail_message_id, requester_company, requester_email, applicant_id, target_name, request_reason,
                result.get("requested_fields") or [], result.get("risk_score"), result.get("risk_level"),
                result.get("decision"), result.get("masking_fields") or [], result.get("reason_codes") or [],
                result.get("missing_items") or [], Jsonb(masking) if masking is not None else None,
                result.get("reply_draft"), mail_subject, mail_body, mail_received_at,
            ),
        ).fetchone()


def set_request_starred(request_id: int, starred: bool) -> dict | None:
    """수신함 별(중요) 표시."""
    with pool.connection() as conn:
        return conn.execute(
            "UPDATE data_requests SET is_starred = %s WHERE id = %s RETURNING id, is_starred",
            (starred, request_id),
        ).fetchone()


def mark_responded(request_id: int, payload: dict, status: str = "responded") -> None:
    """회신 후 실제로 내보낸 내용을 기록(감사 로그)."""
    with pool.connection() as conn:
        conn.execute(
            "UPDATE data_requests SET response_payload = %s, status = %s, responded_at = now() WHERE id = %s",
            (Jsonb(payload), status, request_id),
        )
