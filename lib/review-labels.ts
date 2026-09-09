/**
 * 검수 이력(listReviewHistory)의 kind 를 사람 말로 — 감사 2026-09-04 L7.
 *
 * 이력의 kind 는 감사 로그의 field 라 세 가지가 섞여 온다: 계약 서류 키(contract·agreement…), 공정 서류 키
 * (`process.` 접두사가 붙기도 한다), 그리고 서류가 아닌 내부 필드명(contractConfirmedAt 등). 화면은 계약 서류만
 * 이름을 알아 나머지는 원문이 그대로 나왔다. 여기서 셋을 다 받는다. 호출처는 자기 문맥의 이름(평가된 서류의
 * label)을 먼저 쓰고 없을 때 이것을 부른다.
 */
import { PROCESS_DOCS, docNameOf } from '@/lib/doc-rules';

const FIELD_LABELS: Record<string, string> = {
  contractConfirmedAt: '계약 확인',
  contractSubmittedAt: '계약서 접수',
  documents: '서류',
  preInstall: '기설치 조사',
  'process.status': '공정 단계',
};

export function reviewKindLabel(kind: string): string {
  const field = FIELD_LABELS[kind];
  if (field) return field;
  const bare = kind.startsWith('process.') ? kind.slice('process.'.length) : kind;
  const proc = PROCESS_DOCS.find((d) => d.key === bare)?.name;
  if (proc) return proc;
  return docNameOf(bare) ?? kind;
}
