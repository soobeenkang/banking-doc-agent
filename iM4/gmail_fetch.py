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


def fetch_and_process(query: str = "in:inbox", max_results: int = 5,
                      run_agents: bool = True, force: bool = False) -> list[dict]:
    """
    Gmail 검색 → 메일마다 process_eml 실행 → 결과 리스트.
    한 통이 실패해도 나머지는 계속 처리하고, 실패한 건 {"message_id", "error"} 로 넣는다.
    """

    service = get_service()
    results = []
    for mid, raw in fetch_raw_messages(service, query, max_results):
        try:
            results.append(process_eml(raw, message_id=mid, run_agents=run_agents, force=force))
        except Exception as e:
            results.append({"message_id": mid, "error": str(e)})
    return results


def main():
    parser = argparse.ArgumentParser(description="Gmail → mail_pipeline 연결 테스트")
    parser.add_argument("-q", "--query", default="in:inbox", help="Gmail 검색어")
    parser.add_argument("-n", "--max", type=int, default=5, help="가져올 메일 수")
    parser.add_argument("--dataset-only", action="store_true", help="에이전트 호출 없이 PDF만 생성")
    parser.add_argument("--force", action="store_true", help="이미 처리한 메일도 다시 실행")
    args = parser.parse_args()

    results = fetch_and_process(
        args.query, args.max, run_agents=not args.dataset_only, force=args.force,
    )

    for i, result in enumerate(results, 1):
        print()
        print("=" * 60)
        print(f"[{i}] Gmail ID : {result['message_id']}")
        print("=" * 60)
        if "error" in result:
            print(f"실패 : {result['error']}")
            continue
        print(f"제목 : {result['subject']}")
        for key in ("workflow2", "workflow1"):
            wf = result.get(key)
            if wf:
                print(f"{key} : {wf.get('decision') or wf.get('error')}")

    if not results:
        print(f"검색 결과가 없습니다 (q={args.query!r})")


if __name__ == "__main__":
    main()
