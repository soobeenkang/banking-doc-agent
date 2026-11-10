"""
config.py

환경설정: API Key, Agent ID, Config ID, 폴더 경로
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

##################################################
# Upstage API / Studio Agent
##################################################

UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY")
UPSTAGE_PROJECT_ID = os.getenv("UPSTAGE_PROJECT_ID")

AGENT_ID = os.getenv("AGENT_ID")
CONFIG_ID = os.getenv("CONFIG_ID", "1")

# 워크플로우 2 (메일 요청 보안 판정)
AGENT_ID_2 = os.getenv("AGENT_ID_2")
CONFIG_ID_2 = os.getenv("CONFIG_ID_2", "1")

# 메일 → PDF 변환에 쓰는 한글 폰트
# .env 의 MAIL_FONT_PATH 가 우선이고, 없으면 OS 기본 폰트 중 있는 것을 쓴다
MAIL_FONT_CANDIDATES = [
    os.getenv("MAIL_FONT_PATH"),
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",  # macOS
    "C:/Windows/Fonts/malgun.ttf",                 # Windows (맑은 고딕)
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",  # Linux
]
MAIL_FONT_PATH = next(
    (f for f in MAIL_FONT_CANDIDATES if f and Path(f).exists()), None
)

##################################################
# Directory
##################################################

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"

RESULT_DIR = BASE_DIR / "result"

# 메일 데이터셋: data/mail/<메일ID>/mail.pdf + 첨부파일
MAIL_DATA_DIR = DATA_DIR / "mail"

MAIL_RESULT_DIR = RESULT_DIR / "mail"


def validate_config(agent_id):

    missing = []

    if not UPSTAGE_API_KEY:
        missing.append("UPSTAGE_API_KEY")

    if not agent_id:
        missing.append("AGENT_ID")

    if missing:
        raise ValueError(
            "다음 환경변수가 설정되지 않았습니다.\n\n"
            + "\n".join(missing)
        )

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
