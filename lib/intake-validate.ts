/**
 * 접수 검증 — 화면과 서버가 같은 함수를 쓴다.
 *
 * 클라이언트 검증만 두면 우회된다. 제출 버튼을 잠그는 근거와
 * API 가 거절하는 근거가 같아야 「왜 안 되는지」가 어긋나지 않는다.
 */
import type { IntakeDraft } from '@/types/project';
import { buildDocContext, evaluateDocs } from './doc-rules';

export interface IntakeCheck {
  /** 제출을 막는 문제 */
  errors: string[];
  /** 제출은 되지만 알려야 하는 것 (영업비 지급조건 등) */
  warnings: string[];
  requiredCount: number;
  satisfiedCount: number;
}

export function checkDraft(draft: IntakeDraft): IntakeCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  /*
   * 목록 두 개는 없을 수 있다고 보고 센다.
   *
   * 화면에서 부를 때는 늘 있지만, /api/projects 는 아무 본문이나 받는다. 예전에는
   * draft.lines.length 에서 곧바로 터져서 「Cannot read properties of undefined」가
   * 그대로 응답으로 나갔다 — 서버 검증이 클라이언트 검증의 사본이라 이 자리가 비어 있었다.
   */
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const documents = Array.isArray(draft?.documents) ? draft.documents : [];

  if (!draft?.name?.trim()) errors.push('현장명을 입력하세요.');
  if (!draft?.cpo) errors.push('운영사를 선택하세요.');
  if (!draft?.contractParty) errors.push('계약 주체를 선택하세요 — 회의록 종류가 여기서 정해집니다.');
  if (!draft?.powerType) errors.push('수전 방식을 선택하세요.');
  if (!draft?.bizType) errors.push('사업구분을 선택하세요.');

  /*
   * ★대수는 접수를 막지 않는다★ (한백 지시 2026-09-14 「기본 현장정보만 입력해서 일단
   * 계약접수 할 수 있게」). 현장은 이름·운영사·계약조건이 정해지는 순간 존재하는데, 대수와
   * 서류는 그 뒤에 며칠씩 걸려 모인다 — 그동안 콘솔에 현장이 없으면 진행 상황을 적을 자리도
   * 없어 그 며칠이 통째로 콘솔 밖에 남았다. 만들어 두고 현장 상세에서 마저 채운다.
   * 보드가 그 자리를 이미 갖고 있다 — 「계약접수」는 처음 모으는 동안 서는 칸이다(lib/board).
   *
   * 적힌 대수가 ★틀린★ 것은 그대로 막는다 — 없는 것과 잘못된 것은 다른 말이다.
   */
  if (lines.length === 0) {
    warnings.push('대수를 아직 안 적었습니다 — 현장 상세에서 채웁니다.');
  } else {
    lines.forEach((l, i) => {
      if (!l.qty || l.qty < 1) errors.push(`계약 라인 ${i + 1}: 대수를 1 이상으로 입력하세요.`);
      if (![5, 7, 10].includes(l.termYears)) errors.push(`계약 라인 ${i + 1}: 계약기간을 선택하세요.`);
      if (draft.powerType === '한전불입+모자분리' && !l.powerType) {
        errors.push(`계약 라인 ${i + 1}: 혼용 현장이므로 라인의 수전방식을 골라야 합니다.`);
      }
    });
  }

  if (draft?.preInstall === '있음' && !draft.preNote?.trim()) {
    errors.push('기설치 충전기가 있으므로 기설치 현황을 적어주세요.');
  }

  // 서류 — 조건부 규칙을 그대로 적용
  const ctx = buildDocContext({
    cpo: draft?.cpo,
    contractParty: draft?.contractParty,
    bldgType: draft?.bldgType,
    projectPowerType: draft?.powerType,
    linePowerTypes: lines.map((l) => l.powerType),
    preInstall: draft?.preInstall,
    bizType: draft?.bizType,
  });
  const evaluated = evaluateDocs(ctx);
  const attached = new Set(documents.map((d) => d.kind));

  const required = evaluated.filter((d) => d.req === 'm');
  const missing = required.filter((d) => !attached.has(d.key));
  /*
   * ★필수 서류도 접수를 막지 않는다★ (한백 지시 2026-09-14, 위 대수와 같은 까닭).
   * 「필수」는 ★계약을 확인하려면★ 있어야 한다는 뜻이지 현장을 만들 수 없다는 뜻이 아니다 —
   * 그 판정은 계약 확인(lib/stage 의 docsFilled)이 이미 한 곳에서 하고 있고, 협력사가
   * 「계약서 접수하기」를 누르는 자리에서도 다시 본다. 여기서 또 막으면 한 사실을 세 번 막는다.
   * 화면은 그대로 말한다 — 서류 구역이 「필수 n/m」과 「필수 서류 미충족」을 단다.
   */
  if (missing.length > 0) {
    warnings.push(`필수 서류 ${missing.length}건 미첨부: ${missing.map((d) => d.label).join(', ')}`);
  }

  /*
   * 「영업비 지급조건 미달」 경고는 걷었다 (2026-08-31) — 지급조건이 필수 서류 전체가
   * 되면서 바로 위 「필수 서류 N건 미첨부」와 같은 말이 됐다. 같은 것을 두 번 적으면
   * 어느 쪽이 접수를 막는 것인지 흐려진다(화면 규칙 5).
   */

  return {
    errors,
    warnings,
    requiredCount: required.length,
    satisfiedCount: required.length - missing.length,
  };
}
