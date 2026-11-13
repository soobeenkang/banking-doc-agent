"""
agent_client.py

Studio Agent 실행 모듈

Agent ID 하나로 어떤 Studio Agent든 실행한다.
Job 생성 → 상태 조회(Polling) → 결과 JSON 파싱
"""

import json
import time

from openai import OpenAI

from config import (
    UPSTAGE_API_KEY,
    UPSTAGE_PROJECT_ID
)

##################################################
# OpenAI Client
##################################################

client = OpenAI(
    api_key=UPSTAGE_API_KEY,
    base_url="https://api.upstage.ai/v2",
    default_headers={"x-project-id": UPSTAGE_PROJECT_ID} if UPSTAGE_PROJECT_ID else None,
)


##################################################
# Agent Client
##################################################

class AgentClient:
    """
    Studio Agent 실행 클래스
    """

    def __init__(
        self,
        agent_id: str,
        config_id: str = "1"
    ):

        self.agent_id = agent_id
        self.config_id = config_id

    ##################################################
    # Job 생성
    ##################################################

    def create_job(
        self,
        file_id: str | list[str]
    ) -> str:

        file_ids = [file_id] if isinstance(file_id, str) else file_id

        input_data = [
            {
                "role": "user",
                "content": [
                    {"type": "input_file", "file_id": fid}
                    for fid in file_ids
                ]
            }
        ]

        response = client.responses.create(

            model=self.agent_id,

            include=["last"],

            input=input_data,

            extra_body={
                "config_id": self.config_id
            }

        )

        return response.id

    ##################################################
    # Polling
    ##################################################

    def wait_until_complete(
        self,
        job_id: str,
        interval: int = 2
    ):

        response = client.responses.retrieve(

            job_id,

            include=["last"]

        )

        print(f"Status : {response.status}")

        while response.status in (
            "queued",
            "in_progress"
        ):

            time.sleep(interval)

            response = client.responses.retrieve(

                job_id,

                include=["last"]

            )

            print(f"Status : {response.status}")

        if response.status == "failed":

            raise RuntimeError(
                "Studio Agent 실행 실패"
            )

        if response.status != "completed":

            raise RuntimeError(
                f"Unknown Status : {response.status}"
            )

        print("Job Complete")

        return response

    ##################################################
    # Result Parsing
    ##################################################

    def parse_result(
        self,
        response
    ):

        if not response.output_text:

            raise ValueError(
                "output_text가 존재하지 않습니다."
            )

        result = response.output_text

        # 에이전트가 JSON을 문자열로 한 번 더 감싸 보내는 경우가 있어서,
        # 문자열이 남아 있으면 같은 보정을 다시 적용한다 (최대 3겹)
        for _ in range(3):
            if not isinstance(result, str):
                return result
            try:
                result = self._loads_lenient(result)
            except json.JSONDecodeError:
                raise ValueError(
                    "output_text가 JSON 형식이 아닙니다.\n"
                    f"--- 응답 앞부분 ---\n{response.output_text[:1000]}"
                )

        raise ValueError(
            "output_text가 여러 겹 문자열로 감싸져 있습니다.\n"
            f"--- 응답 앞부분 ---\n{response.output_text[:1000]}"
        )

    @staticmethod
    def _loads_lenient(text: str):
        """코드블록·앞뒤 설명 문장을 걷어내고 JSON을 파싱한다."""

        text = text.strip()

        # ```json ... ``` 코드블록 제거
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0].strip()

        try:
            result = json.loads(text)

        except json.JSONDecodeError:
            # 앞뒤에 설명 문장이 붙은 경우: 첫 { 부터 마지막 } 까지만 시도
            start, end = text.find("{"), text.rfind("}")
            try:
                if start == -1 or end <= start:
                    raise json.JSONDecodeError("no object", text, 0)
                result = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                raise ValueError(
                    "output_text가 JSON 형식이 아닙니다.\n"
                    f"--- 응답 앞부분 ---\n{response.output_text[:1000]}"
                )

        if isinstance(result, str):
            result = json.loads(result)

        return result

    ##################################################
    # Agent 실행
    ##################################################

    def run(
        self,
        file_id: str | list[str]
    ):

        print("-" * 60)
        print("Create Job")
        print("-" * 60)

        job_id = self.create_job(
            file_id
        )

        print(f"Job ID : {job_id}")
        print()

        print("-" * 60)
        print("Waiting...")
        print("-" * 60)

        response = self.wait_until_complete(
            job_id
        )

        print()

        print("-" * 60)
        print("Parse Result")
        print("-" * 60)

        result = self.parse_result(
            response
        )

        print("JSON Parsing Complete")

        return result