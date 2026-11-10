"""서버 설정. server/.env 에서 읽는다."""

import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SERVER_DIR / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]

# 팀원 Upstage 코드(iM4) 위치. 기본값: server와 같은 위치의 iM4 폴더
IM4_DIR = Path(os.getenv("IM4_DIR", SERVER_DIR.parent / "iM4")).resolve()

# 워크플로우 1 (서류 판정) Studio Agent
WORKFLOW1_AGENT_ID = os.getenv("WORKFLOW1_AGENT_ID", "")
WORKFLOW1_CONFIG_ID = os.getenv("WORKFLOW1_CONFIG_ID", "1")

# 업로드 파일 임시 저장 위치
UPLOAD_DIR = SERVER_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# React 개발 서버 주소 (CORS 허용)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
