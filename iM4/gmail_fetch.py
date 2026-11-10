"""
gmail_fetch.py

Gmail에서 메일을 가져와 mail_pipeline.process_eml 로 넘기는 연결 테스트 코드.

준비
    - credentials.json : Google Cloud OAuth 클라이언트(데스크톱 앱) 키, 이 폴더에 둔다
    - 처음 실행하면 브라우저가 열리고 Gmail 로그인/권한 허용 → token.json 이 생긴다

사용법
    python gmail_fetch.py                          # 받은편지함 최근 5개
    python gmail_fetch.py -q "subject:R11" -n 1    # Gmail 검색어로 골라서
    python gmail_fetch.py --dataset-only           # 에이전트 호출 없이 PDF만
"""

import argparse
import base64
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from mail_pipeline import process_eml

BASE_DIR = Path(__file__).resolve().parent
CREDENTIALS_PATH = BASE_DIR / "credentials.json"
TOKEN_PATH = BASE_DIR / "token.json"

# 읽기 전용 권한
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


def get_service():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json())

    return build("gmail", "v1", credentials=creds)


def fetch_raw_messages(service, query: str = "in:inbox", max_results: int = 5):
    """(message_id, raw bytes) 를 하나씩 돌려준다."""
    resp = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    for item in resp.get("messages", []):
        msg = service.users().messages().get(
            userId="me", id=item["id"], format="raw"
        ).execute()
        yield item["id"], base64.urlsafe_b64decode(msg["raw"])


def main():
    parser = argparse.ArgumentParser(description="Gmail → mail_pipeline 연결 테스트")
    parser.add_argument("-q", "--query", default="in:inbox", help="Gmail 검색어")
    parser.add_argument("-n", "--max", type=int, default=5, help="가져올 메일 수")
    parser.add_argument("--dataset-only", action="store_true", help="에이전트 호출 없이 PDF만 생성")
    parser.add_argument("--force", action="store_true", help="이미 처리한 메일도 다시 실행")
    args = parser.parse_args()

    service = get_service()

    count = 0
    for mid, raw in fetch_raw_messages(service, args.query, args.max):
        count += 1
        print()
        print("=" * 60)
        print(f"[{count}] Gmail ID : {mid}")
        print("=" * 60)
        try:
            result = process_eml(
                raw, message_id=mid,
                run_agents=not args.dataset_only, force=args.force,
            )
            print(f"제목 : {result['subject']}")
            if result.get("workflow2"):
                print(f"워크플로우2 : {result['workflow2'].get('decision')}")
            if result.get("workflow1"):
                print(f"워크플로우1 : {result['workflow1'].get('decision')}")
        except Exception as e:
            print(f"실패 : {e}")

    if count == 0:
        print(f"검색 결과가 없습니다 (q={args.query!r})")


if __name__ == "__main__":
    main()
