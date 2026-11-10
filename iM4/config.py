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

##################################################
# Directory
##################################################

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"

RESULT_DIR = BASE_DIR / "result"


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
