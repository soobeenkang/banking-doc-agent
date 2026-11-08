"""
Upstage 워크플로우 실행. 팀원의 iM4 코드(upload.py, agent_client.py)를 수정 없이 import 해서 쓴다.

iM4 코드는 `from config import ...` 처럼 iM4 폴더 기준으로 import 하므로
iM4 폴더를 sys.path에 추가한다. Upstage API 키는 iM4/.env 에서 읽힌다.
"""

import json
import sys
from pathlib import Path

from .settings import IM4_DIR, WORKFLOW1_AGENT_ID, WORKFLOW1_CONFIG_ID

if str(IM4_DIR) not in sys.path:
    sys.path.insert(0, str(IM4_DIR))

from agent_client import AgentClient, client  # noqa: E402  (iM4/agent_client.py)
from upload import upload_file  # noqa: E402  (iM4/upload.py)


def _agent() -> AgentClient:
    if not WORKFLOW1_AGENT_ID:
        raise RuntimeError("server/.env에 WORKFLOW1_AGENT_ID가 없습니다")
    return AgentClient(WORKFLOW1_AGENT_ID, WORKFLOW1_CONFIG_ID)


def start_workflow1(path: Path) -> str:
    """파일 업로드 + Job 생성. job_id를 바로 돌려준다(실패해도 Studio·콘솔에서 찾아볼 수 있게)."""
    return _agent().create_job(upload_file(path))


def wait_workflow1(job_id: str) -> dict:
    """Job 완료까지 기다렸다가 결과 JSON을 돌려준다. 실패하면 Upstage가 준 실패 이유를 에러에 담는다."""
    agent = _agent()
    try:
        response = agent.wait_until_complete(job_id)
    except RuntimeError as e:
        raise RuntimeError(f"{e} | job_id={job_id} | {job_failure_detail(job_id)}") from e
    return agent.parse_result(response)


def job_failure_detail(job_id: str) -> str:
    """실패한 Job의 에러 정보만 추려서 문자열로 (최대 2000자)."""
    try:
        r = client.responses.retrieve(job_id, include=["all"]).model_dump(exclude_none=True)
    except Exception as e:  # noqa: BLE001
        return f"상세 조회 실패: {e}"
    detail = {k: r[k] for k in ("status", "error", "incomplete_details") if k in r}
    # 단계별 결과 중 완료되지 않은 단계(실패한 노드)만
    failed_steps = [o for o in r.get("output") or [] if isinstance(o, dict) and o.get("status") not in (None, "completed")]
    if failed_steps:
        detail["failed_steps"] = failed_steps
    detail["config"] = {"agent_id": WORKFLOW1_AGENT_ID, "config_id": WORKFLOW1_CONFIG_ID}
    return json.dumps(detail, ensure_ascii=False, default=str)[:2000]