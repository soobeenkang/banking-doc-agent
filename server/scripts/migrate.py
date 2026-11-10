"""테이블 생성 + field_catalog 초기값. 여러 번 실행해도 안전.
실행: server 폴더에서  python scripts/migrate.py
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SERVER_DIR / ".env")

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    for name in ("schema.sql", "seed_field_catalog.sql"):
        conn.execute((SERVER_DIR / "db" / name).read_text(encoding="utf-8"))
        print(f"applied {name}")
