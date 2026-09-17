# scripts/ — 무엇이 앞으로 쓸 것이고 무엇이 끝난 일인가

스물일곱 개가 한 폴더에 있어서, 처음 보는 사람은 어느 것을 돌려도 되는지 알 수 없다.
**옮기지 않고 여기 적는다** — 지금 이 폴더에서 이관 작업이 돌고 있어(정산 이관) 파일을
옮기면 그쪽과 부딪힌다. 새 스크립트를 더할 때 이 표에 한 줄 같이 적는다.

## 1. 늘 쓰는 것 — `package.json` 에 걸려 있다

| 스크립트 | 명령 | 무엇 |
|---|---|---|
| `migrate.ts` | `npm run db:migrate` · `npm run build` | 마이그레이션 러너. **빌드가 먼저 돌려 DB 를 코드보다 앞세운다** |
| `build-charger-index.ts` | `npm run index:charger` | 충전기 이력 CSV → 조회 인덱스 |
| `build-subsidy-index.ts` | `npm run index:subsidy` | 보조금 이력 CSV → 조회 인덱스 |
| `verify-charger-index.ts` | `npm run index:charger:verify` | 위 인덱스와 원본을 맞춰 본다 |
| `bootstrap-admin.ts` | `npm run auth:bootstrap` | 첫 관리자 계정 |
| `check-partner-leak.ts` | `npm run check:leak` | 협력사 응답에 한백 전용 값이 새는지 |
| `check-orient.ts` | `npm run check:orient` | 스캔 방향 감지 검사 — ★API 를 부르므로 돈이 든다★ |
| `perf.ts` | `npm run perf` | 주요 조회 응답 시간 |
| `backfill-contract-confirm.ts` | `npm run db:backfill-confirm` | 계약 확인 도입 전 현장 채우기 |
| `csv-rows.ts` | (라이브러리) | 인덱스 생성기들이 함께 쓰는 CSV 리더 — 혼자 못 돈다 |
| `hash-password.mjs` | 직접 | 계정 비밀번호 해시 |

## 2. 필요할 때 쓰는 것 — 정책·데이터 반영

정책이 바뀌면 **정의 파일 → 이 생성기 → `migrations/000N_*.sql`** 순서다(CLAUDE.md).
찍기만 하고 DB 는 안 건드린다 — 적용은 마이그레이션 러너가 한다.

| 스크립트 | 무엇 |
|---|---|
| `print-nice-h2-sql.ts` · `print-plhec-h2-sql.ts` · `print-sk-h2-sql.ts` · `print-everon-h2-sql.ts` · `print-link-h2-sql.ts` | 운영사별 정책 SQL 생성기 |
| `delete-pricing-case.ts` | 잘못 만든 단가 케이스 삭제 — **참조가 없을 때만** |
| `tidy-materials.ts` | 자료실 파일 이름 규칙·분류 정리 |
| `snapshot-notion.ts` | 노션 데이터베이스를 파일로 받아 둔다(읽기 전용) — 이관 전 스냅샷 |
| `archive-blob.ts` | ★프로덕션 파일 아카이브★ (읽기 전용). Vercel Blob 전부를 오프사이트 폴더로 누적 복사하고 매니페스트(경로·주소·어느 표의 어느 행)를 같이 남긴다 — Blob 에는 버전도 휴지통도 없고 서류 주소의 대부분이 임의 접미사라 매니페스트 없이는 복구가 안 된다. `.env.prod-blob` 필요 |
| `restore-blob.ts` | ★아카이브에서 되살리기★ — 파일을 다시 올리고 DB 의 옛 주소를 새 주소로 갈아끼운다(드라이런 기본). 되살릴 때는 임의 접미사를 꺼서 다음부터는 갈아끼울 것이 없게 한다 |
| `check-pricing-consistency.ts` | ★단가표가 스스로 일치하는가★ (읽기 전용) — 케이스의 기본 정산 규칙 합 ↔ 받는 단가(케이스를 만들 때 쓰는 `checkSettlementSteps` 그대로) · 기본 규칙이 없는 케이스 · 케이스 이름 ↔ 축(이름은 저장된 글자라 축을 고쳐도 안 따라온다) · 막힌 라인과 닿을 수 없는 케이스. 이쪽은 ★케이스 자체★를 보고 아래 drift 는 ★그 케이스를 붙인 현장★을 본다 |
| `check-settlement-drift.ts` | ★기성 계획이 받는 단가와 어긋난 현장★ (읽기 전용) — 받는 단가는 케이스에, 기성 차수 금액은 정산 규칙에 따로 산다. 「잔액」·「비율」 단계는 총액을 따라오지만 ★「고정」은 금액이 박혀 있어 안 따라온다★. 게다가 정산 규칙은 현장에 규칙이 ★없을 때만★ 케이스에서 따라 붙는다(applySuggestedSettlement) — 나중에 케이스를 바꾸면 규칙은 옛것 그대로다. 그 차이는 조용히 한백 마진으로 잡히므로 직접 재서 찍는다 |
| `check-blocked-lines.ts` | ★케이스를 못 찾는 라인★ (읽기 전용) — 단가 화면의 「막힌 라인」과 같은 판정을 콘솔 밖에서 돌린다. `--cpo` 로 운영사를 좁힌다. 새 라인이 닿을 수 없는 활성 케이스(축이 화면에 안 서는 것)도 같이 찍는다 — 축을 시기마다 다르게 세우면 한 시기만 구멍이 나는데 목록을 훑어서는 안 보인다 |
| `check-site.ts` | ★현장 하나의 전모★ (읽기 전용) — `--name <이름 일부>` 로 찾아 계약 라인·대수·단가 케이스의 대당 금액·지급조건 잠금·협력사 지급 계획과 나간 돈·기성 차수·정산 메모를 한 화면에 찍는다. 계약변경처럼 대수를 고치기 전에 무엇이 같이 움직이는지 보는 자리 |
| `check-settlement-terms.ts` | ★노션 정산관리 ↔ 콘솔 지급조건 대조★ (읽기 전용, 쓰는 갈래 없음). 케이스 이름·대수·턴키·영업비·시공비·나간 1차를 141행 한꺼번에 본다 — 이관이 축으로 케이스를 다시 고른 탓에 정책 시기(상반기/하반기)가 틀어진 자리를 찾는다 |

## 3. 끝난 일 · 진행 중인 이관 — 함부로 돌리지 않는다

**이 칸의 스크립트는 한 번 도는 것을 전제로 쓰였다.** 다시 돌리기 전에 그 파일 머리말의
멱등성 설명을 먼저 읽는다(대개 `mgmt_no` 같은 열쇠로 중복을 막지만, 전부 그렇지는 않다).

| 스크립트 | 언제 | 상태 |
|---|---|---|
| `import-notion-2026.ts` | 2026-08-24 현장 140건 이관 | 끝남 (멱등 — 열쇠는 mgmt_no) |
| `import-notion-files.ts` | 2026-08-24 서류 파일 이관 | 끝남 |
| `sync-notion-notes.ts` | 노션 「현재상황」 → 진행 메모 | 컷오버 전 보조용 |
| `import-notion-settlements.ts` | 노션 정산 198건 이관 | **진행 중** (이관 후속 ①) |
| `merge-self-repl-lines.ts` | 2026-08-27 교체유형으로 갈린 자투 라인 합치기 | 끝남 (드라이런이 기본, `--write` 로 실행) |
| `migrate-channel-rule-names.ts` | 2026-08-21 단가 화면 개편 데이터 이관 | 끝남 |
| `apply-nice-h2-pricing.ts` | 나이스 하반기 정책 최초 반영(개발 DB) | 끝남 — 지금은 마이그레이션이 그 일을 한다 |
| `fix-hwajin-qty.ts` | 2026-09-11 화진금봉5차 계약변경 5대→3대 | 끝남 (시험 실행이 기본, `--apply` 로 실행 · 두 번 돌아도 조정이 안 겹친다) |
| `fix-yeongsin-settlement.ts` | 2026-09-18 광양 영신그린빌 정산 규칙 정정(상반기 고정 → 하반기 비율) | 끝남 (시험 실행이 기본, `--apply` 로 실행 · 이미 바뀌었으면 스스로 멈춘다) |

## 프로덕션에 붙일 때

`--env .env.prod-db` 로 접속 문자열을 준다(CLAUDE.md). **드라이런이 있는 스크립트는 먼저
드라이런**을 돌리고, 무엇이 바뀌는지 눈으로 본 뒤 `--write` 한다.
