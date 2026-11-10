"""
FastAPI 서버
실행: server 폴더에서  uvicorn app.main:app --reload
문서: http://localhost:8000/docs
"""

import logging
import shutil
import uuid
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from . import store
from .db import pool
from .settings import CORS_ORIGINS, UPLOAD_DIR


@asynccontextmanager
async def lifespan(_):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="banking-doc-agent", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

# 업로드 처리 상태 (서버 메모리). 서버를 재시작하면 비워진다.
TASKS: dict[str, dict] = {}


def _process_upload(task_id: str, path, file_name: str):
    """백그라운드: Upstage 워크플로우 1 실행 → DB 저장."""
    from .upstage import start_workflow1, wait_workflow1  # iM4 코드는 실제로 실행할 때만 불러온다

    TASKS[task_id]["status"] = "running"
    try:
        job_id = start_workflow1(path)
        TASKS[task_id]["job_id"] = job_id  # 실행 중에도 job_id 확인 가능
        result = wait_workflow1(job_id)
        TASKS[task_id]["status"] = "saving"
        saved = store.save_workflow1(result, job_id=job_id, file_name=file_name)
        TASKS[task_id].update(status="done", **saved)
    except Exception as e:  # noqa: BLE001
        logging.exception("workflow1 처리 실패 task=%s file=%s", task_id, file_name)
        TASKS[task_id].update(status="failed", error=str(e))
    finally:
        path.unlink(missing_ok=True)


##################################################
# 신청 (워크플로우 1)
##################################################


@app.post("/api/applications", status_code=202)
def upload_application(file: UploadFile, background: BackgroundTasks):
    """서류 묶음 PDF 업로드 → 워크플로우 1을 백그라운드로 실행. 진행 상태는 /api/tasks/{task_id}로 확인."""
    task_id = uuid.uuid4().hex
    path = UPLOAD_DIR / f"{task_id}_{file.filename}"
    with path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    TASKS[task_id] = {"task_id": task_id, "file_name": file.filename, "status": "queued"}
    background.add_task(_process_upload, task_id, path, file.filename)
    return TASKS[task_id]


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str):
    """status: queued → running → saving → done | failed. done이면 application_id가 있다."""
    if task_id not in TASKS:
        raise HTTPException(404, "task not found")
    return TASKS[task_id]


@app.post("/api/applications/import")
def import_result(body: dict):
    """이미 받은 워크플로우 결과 JSON을 저장 (Upstage 호출 없이 테스트할 때).
    body: {"result": <결과 JSON>, "job_id": "...", "file_name": "..."}  (Studio에서 복사한 content/metadata 형식도 가능)
    """
    try:
        return store.save_workflow1(body.get("result", body), job_id=body.get("job_id"), file_name=body.get("file_name"))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/applications")
def list_applications(decision: str | None = None, limit: int = Query(100, le=500)):
    """신청 목록 (통과·반려 모두). decision=처리 완료 / 검토 필요 / 서류 누락 으로 필터."""
    return store.list_applications(decision, limit)


@app.get("/api/applications/{application_id}")
def get_application(application_id: int):
    """신청 상세. 통과 건이면 documents에 서류별 추출값이 들어 있다."""
    app_ = store.get_application(application_id)
    if not app_:
        raise HTTPException(404, "application not found")
    return app_


@app.get("/api/applications/{application_id}/documents")
def get_application_documents(application_id: int):
    """신청 건의 저장된 서류 (통과 건만 존재, 나머지는 빈 배열)."""
    return store.get_application_documents(application_id)


@app.get("/api/field-catalog")
def get_field_catalog():
    """서류·필드별 민감도와 위험 그룹."""
    return store.list_field_catalog()


##################################################
# 고객 (워크플로우 2에서 사용)
##################################################


@app.get("/api/customers/{applicant_id}")
def get_customer(applicant_id: str):
    c = store.get_customer(applicant_id)
    if not c:
        raise HTTPException(404, "customer not found")
    return c


@app.get("/api/customers/{applicant_id}/sensitivity")
def get_sensitivity(applicant_id: str, doc_types: list[str] | None = Query(None)):
    """요청 서류의 민감 필드·민감도·그룹. 예: ?doc_types=employment_certificate&doc_types=loan_application"""
    if not store.get_customer(applicant_id):
        raise HTTPException(404, "customer not found")
    return store.get_sensitivity_profile(applicant_id, doc_types)