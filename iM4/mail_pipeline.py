"""
mail_pipeline.py

메일 한 통 → 데이터셋(PDF) 저장 → Studio Agent 실행 → 결과 JSON 저장

흐름
    Gmail API 
        └─ process_mail(mail)  또는  process_eml(raw_bytes)
            1. 메일 본문을 PDF로 변환 → data/mail/<메일ID>/mail.pdf
            2. 첨부파일 저장          → data/mail/<메일ID>/<첨부파일명>
            3. mail.pdf      → 워크플로우 2 (메일 요청 보안 판정, AGENT_ID_2)
            4. 문서 첨부파일 → 워크플로우 1 (서류 판정, AGENT_ID)  ※ 첨부가 있을 때만
            5. 결과 저장              → result/mail/<메일ID>.json

Gmail 쪽 연동 방법 (둘 중 편한 것)
    A) raw 메일을 그대로 넘기기
        msg = service.users().messages().get(userId="me", id=mid, format="raw").execute()
        raw = base64.urlsafe_b64decode(msg["raw"])
        process_eml(raw, message_id=mid)

    B) 직접 dict로 만들어 넘기기
        process_mail({
            "message_id": mid,
            "subject": "대출 잔액 좀 알려주세요",
            "sender": "김태민 <tm@example.com>",
            "date": "2026-11-08 20:09",
            "body": "안녕하세요 ...",
            "attachments": [{"filename": "대출신청서.pdf", "data": b"..."}],
        })

    raw 메일을 .eml 파일로 저장만 해 두면 CLI로도 돌릴 수 있다.

사용법
    python mail_pipeline.py inbox/                # 폴더 안 .eml 전부
    python mail_pipeline.py inbox/R11.eml         # 1개
    python mail_pipeline.py inbox/ --dataset-only # 에이전트 호출 없이 PDF 데이터셋만 생성
    python mail_pipeline.py inbox/ --force        # 이미 처리한 메일도 다시 실행
"""

import argparse
import email
import html
import json
import re
from email import policy
from email.utils import parsedate_to_datetime
from pathlib import Path

from fpdf import FPDF

from config import (
    AGENT_ID,
    AGENT_ID_2,
    CONFIG_ID,
    CONFIG_ID_2,
    MAIL_DATA_DIR,
    MAIL_FONT_PATH,
    MAIL_RESULT_DIR,
)

# 워크플로우 1에 넘길 첨부파일 확장자
DOC_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".docx", ".pptx", ".xlsx", ".hwp", ".hwpx"}


##################################################
# 메일 파싱 (.eml / raw bytes → dict)
##################################################

def _html_to_text(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style).*?</\1>", "", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", markup)
    text = html.unescape(re.sub(r"<[^>]+>", "", markup))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_eml(raw: bytes, message_id: str | None = None) -> dict:
    """RFC822 raw 메일을 process_mail 이 받는 dict 형태로 바꾼다."""

    msg = email.message_from_bytes(raw, policy=policy.default)

    body_part = msg.get_body(preferencelist=("plain", "html"))
    body = ""
    if body_part is not None:
        body = body_part.get_content()
        if body_part.get_content_type() == "text/html":
            body = _html_to_text(body)

    attachments = []
    for part in msg.iter_attachments():
        filename = part.get_filename()
        data = part.get_payload(decode=True)
        if filename and data:
            attachments.append({"filename": filename, "data": data})

    date = msg.get("Date", "")
    try:
        date = parsedate_to_datetime(date).strftime("%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        pass

    return {
        "message_id": message_id or msg.get("Message-ID", "").strip("<>"),
        "subject": str(msg.get("Subject", "")),
        "sender": str(msg.get("From", "")),
        "date": date,
        "body": body.strip(),
        "attachments": attachments,
    }


##################################################
# 메일 → PDF (데이터셋 형식)
##################################################

def mail_to_pdf(mail: dict, out_path: Path) -> Path:
    """제목 / 보낸 사람 / 받은 시각 / 본문 을 한 장짜리 PDF로 만든다."""

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    if not MAIL_FONT_PATH:
        raise FileNotFoundError("한글 폰트를 찾지 못했습니다. .env 에 MAIL_FONT_PATH 를 지정하세요.")
    pdf.add_font("kr", fname=MAIL_FONT_PATH)
    pdf.set_font("kr", size=11)

    def line(text: str):
        # new_x/new_y: 줄마다 왼쪽 여백으로 돌아가게
        pdf.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")

    line(f"제목: {mail.get('subject', '')}")
    line(f"보낸 사람: {mail.get('sender', '')}")
    if mail.get("date"):
        line(f"받은 시각: {mail['date']}")

    names = [a["filename"] for a in mail.get("attachments", [])]
    if names:
        line(f"첨부파일: {', '.join(names)}")

    line("")
    line(mail.get("body", "") or "(본문 없음)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))
    return out_path


##################################################
# 파이프라인
##################################################

def _safe_name(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\s]+', "_", name).strip("._")
    return name or "mail"


def save_to_dataset(mail: dict) -> tuple[Path, list[Path]]:
    """메일 PDF와 첨부파일을 data/mail/<메일ID>/ 에 저장한다."""

    mail_dir = MAIL_DATA_DIR / _safe_name(mail["message_id"])
    mail_pdf = mail_to_pdf(mail, mail_dir / "mail.pdf")

    attachment_paths = []
    for att in mail.get("attachments", []):
        path = mail_dir / _safe_name(att["filename"])
        if path.name == "mail.pdf":
            path = path.with_name("attachment_mail.pdf")
        path.write_bytes(att["data"])
        attachment_paths.append(path)

    return mail_pdf, attachment_paths


def _run_agent(agent_id: str, config_id: str, paths: list[Path]) -> dict:
    # API 키가 없어도 --dataset-only 는 돌아가도록 여기서 import
    from agent_client import AgentClient
    from upload import upload_file

    try:
        file_ids = [upload_file(p) for p in paths]
        return AgentClient(agent_id=agent_id, config_id=config_id).run(file_ids)
    except Exception as e:
        return {"error": str(e)}


def process_mail(mail: dict, run_agents: bool = True, force: bool = False) -> dict:
    """
    메일 dict 하나를 처리하고 결과 dict 를 돌려준다.
    결과는 result/mail/<메일ID>.json 에도 저장된다.
    """

    if not mail.get("message_id"):
        raise ValueError("message_id 가 필요합니다 (Gmail 메시지 ID).")

    out_path = MAIL_RESULT_DIR / f"{_safe_name(mail['message_id'])}.json"
    if run_agents and out_path.exists() and not force:
        print(f"이미 처리됨, 건너뜀 : {out_path}")
        return json.loads(out_path.read_text(encoding="utf-8"))

    mail_pdf, attachment_paths = save_to_dataset(mail)
    print(f"데이터셋 저장 : {mail_pdf.parent}")

    doc_paths = [p for p in attachment_paths if p.suffix.lower() in DOC_EXTENSIONS]

    result = {
        "message_id": mail["message_id"],
        "subject": mail.get("subject", ""),
        "sender": mail.get("sender", ""),
        "date": mail.get("date", ""),
        "mail_pdf": str(mail_pdf),
        "attachments": [p.name for p in attachment_paths],
        "workflow2": None,  # 메일 요청 보안 판정
        "workflow1": None,  # 첨부 서류 판정
    }

    if not run_agents:
        return result

    if not AGENT_ID_2:
        raise ValueError("AGENT_ID_2 (워크플로우 2) 가 .env 에 없습니다.")

    print("[워크플로우 2] 메일 요청 판정")
    result["workflow2"] = _run_agent(AGENT_ID_2, CONFIG_ID_2, [mail_pdf])

    if doc_paths:
        if not AGENT_ID:
            raise ValueError("AGENT_ID (워크플로우 1) 가 .env 에 없습니다.")
        print(f"[워크플로우 1] 첨부 서류 {len(doc_paths)}건 판정")
        result["workflow1"] = _run_agent(AGENT_ID, CONFIG_ID, doc_paths)

    MAIL_RESULT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=4), encoding="utf-8")
    print(f"결과 저장 : {out_path}")

    return result


def process_eml(raw: bytes, message_id: str | None = None, **kwargs) -> dict:
    return process_mail(parse_eml(raw, message_id), **kwargs)


##################################################
# CLI
##################################################

def main():

    parser = argparse.ArgumentParser(description="메일(.eml) → 데이터셋 PDF → Studio Agent")
    parser.add_argument("target", help=".eml 파일 또는 .eml 이 들어 있는 폴더")
    parser.add_argument("--dataset-only", action="store_true", help="에이전트 호출 없이 PDF만 생성")
    parser.add_argument("--force", action="store_true", help="이미 처리한 메일도 다시 실행")
    args = parser.parse_args()

    target = Path(args.target)
    files = sorted(target.glob("*.eml")) if target.is_dir() else [target]

    print("=" * 60)
    print(f"메일 수 : {len(files)}")
    print("=" * 60)

    failed = []
    for i, path in enumerate(files, 1):
        print()
        print(f"[{i}/{len(files)}] {path.name}")
        try:
            # 파일명(확장자 제외)을 메일 ID로 사용
            process_eml(
                path.read_bytes(),
                message_id=path.stem,
                run_agents=not args.dataset_only,
                force=args.force,
            )
        except Exception as e:
            print(f"실패 : {e}")
            failed.append(path.name)

    print()
    print("=" * 60)
    print(f"완료 {len(files) - len(failed)}건 / 실패 {len(failed)}건")
    for name in failed:
        print(f"  - {name}")
    print("=" * 60)


if __name__ == "__main__":
    main()
