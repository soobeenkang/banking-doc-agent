# 대출서류 민감정보 판정 및 위험도 분석 — Frontend

React 18 + Vite. 기본은 목업 데이터로 단독 실행됩니다.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

## 백엔드 연결 (FastAPI)

`.env` 에 `VITE_USE_MOCK=false` 를 넣으면 `/api` 요청이 `localhost:8000` 으로 프록시됩니다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/applications` | 신청 내역 (ERD loan_applications) |
| GET | `/api/applications/{id}` | 신청 한 건 (접수 결과 카드) |
| GET | `/api/applications/{id}/documents` | 통과 건의 저장 서류 (ERD documents) |
| GET | `/api/field-catalog` | 필드별 민감도 (ERD field_catalog) |
| POST | `/api/applications` | 서류 접수 (multipart, 필드명 file) → `202 {task_id, status}` |
| GET | `/api/tasks/{task_id}` | 접수 처리 상태 `queued → running → saving → done \| failed` (3초마다 조회) |

자료 제공 요청 메일(`/api/mails`, `/api/mails/{id}/send`)은 워크플로우 2 백엔드가 붙기 전까지 `VITE_USE_MOCK` 값과 관계없이 항상 목업(`src/data/mails.js`)을 씁니다.

서류 접수 화면은 최근 접수 목록을 브라우저 localStorage(`submit.tasks`)에 기억해, 새로고침해도 처리 상태를 이어서 보여줍니다. 서버의 처리 상태는 메모리에만 있어 서버를 재시작하면 "확인 불가"로 표시됩니다(결과는 신청 내역에 남아 있음).

목업 데이터: `src/mock/` (워크플로우 1 실제 결과 `sample-w1.json` 기반), `src/data/mails.js`.

모든 데이터는 가상입니다.
