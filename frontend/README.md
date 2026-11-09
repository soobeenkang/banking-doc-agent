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
| GET | `/api/mails` | 수신함 (src/data/mails.js 형태, `sent` 포함) |
| POST | `/api/mails/{id}/send` | 회신 전송 `{reply, attachments}` |
| GET | `/api/applications` | 신청 내역 (ERD loan_applications, src/mock/data.js 형태) |
| GET | `/api/applications/{id}/documents` | 통과 건의 저장 서류 (ERD documents) |
| GET | `/api/field-catalog` | 필드별 민감도 (ERD field_catalog) |
| POST | `/api/applications` | 서류 접수 (multipart, 필드명 file) → loan_application 한 건 |

목업 데이터: `src/mock/` (워크플로우 1 실제 결과 `sample-w1.json` 기반), `src/data/mails.js`.

모든 데이터는 가상입니다.
