"""
run_agent.py

Studio Agent 하나를 문서에 실행하고 결과 JSON을 result/ 에 저장한다.

사용법
    python run_agent.py data/Resume.pdf          # 문서 1개
    python run_agent.py data/                    # 폴더 안 문서 전부
    python run_agent.py data/ --agent-id agt_xxx --config-id 2

Agent ID와 Config ID를 옵션으로 주지 않으면 .env 값을 쓴다.
"""

import argparse
import json
from pathlib import Path

from config import AGENT_ID, CONFIG_ID, RESULT_DIR, validate_config
from upload import upload_file
from agent_client import AgentClient

DOC_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".docx", ".pptx", ".xlsx", ".hwp", ".hwpx"}


def collect_files(target: Path):

    if target.is_dir():
        return sorted(
            p for p in target.iterdir()
            if p.suffix.lower() in DOC_EXTENSIONS
        )

    if not target.exists():
        raise FileNotFoundError(f"{target} 파일이 존재하지 않습니다.")

    return [target]


def main():

    parser = argparse.ArgumentParser(description="Studio Agent 실행")
    parser.add_argument("target", help="문서 파일 또는 문서 폴더")
    parser.add_argument("--agent-id", default=AGENT_ID)
    parser.add_argument("--config-id", default=CONFIG_ID)
    args = parser.parse_args()

    validate_config(args.agent_id)

    files = collect_files(Path(args.target))

    print("=" * 60)
    print(f"Agent ID  : {args.agent_id}")
    print(f"Config ID : {args.config_id}")
    print(f"문서 수   : {len(files)}")
    print("=" * 60)

    agent = AgentClient(agent_id=args.agent_id, config_id=args.config_id)

    failed = []

    for i, file_path in enumerate(files, 1):

        print()
        print(f"[{i}/{len(files)}] {file_path.name}")

        try:
            file_id = upload_file(file_path)
            result = agent.run(file_id)

        except Exception as e:
            print(f"실패 : {e}")
            failed.append(file_path.name)
            continue

        out_path = RESULT_DIR / f"{file_path.stem}.json"

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=4)

        print(f"저장 : {out_path}")

    print()
    print("=" * 60)
    print(f"완료 {len(files) - len(failed)}건 / 실패 {len(failed)}건")
    for name in failed:
        print(f"  - {name}")
    print("=" * 60)


if __name__ == "__main__":
    main()
