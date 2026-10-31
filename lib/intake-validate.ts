/**
 * 접수 검증 — 화면과 서버가 같은 함수를 쓴다.
 *
 * 클라이언트 검증만 두면 우회된다. 제출 버튼을 잠그는 근거와
 * API 가 거절하는 근거가 같아야 「왜 안 되는지」가 어긋나지 않는다.
 */
import type { IntakeDraft } from '@/types/project';
import { buildDocContext, evaluateDocs } from './doc-rules';

/** 막는 문제가 어느 칸의 것인가 — 접수 화면이 그 칸을 붉게 짚고 눌러서 찾아가게 한다 */
export type IntakeIssueField =
  | 'name' | 'cpo' | 'contractParty' | 'powerType' | 'bizType' | 'qty' | 'termYears' | 'preNote';

export interface IntakeCheck {
  /** 제출을 막는 문제 */
  errors: string[];
  /**
   * 같은 문제를 칸과 함께 (2026-10-01) — 단추 밑 목록만으로는 「무엇이 막는지」가 화면 위쪽
   * 칸과 이어지지 않았다(한백 지적 「활성화가 안 되는 이유가 안 떠」). errors 와 같은 순서·같은 말이다.
   */
  issues: Array<{ field: IntakeIssueField; message: string }>;
  /** 제출은 되지만 알려야 하는 것 (영업비 지급조건 등) */
  warnings: string[];
  requiredCount: number;
  satisfiedCount: number;
}

export function checkDraft(draft: IntakeDraft): IntakeCheck {
  const issues: IntakeCheck['issues'] = [];
  const fail = (field: IntakeIssueField, message: string) => { issues.push({ field, message }); };
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

  if (!draft?.name?.trim()) fail('name', '현장명을 입력하세요.');
  if (!draft?.cpo) fail('cpo', '운영사를 선택하세요.');
  if (!draft?.contractParty) fail('contractParty', '계약 주체를 선택하세요 — 회의록 종류가 여기서 정해집니다.');
  if (!draft?.powerType) fail('powerType', '수전 방식을 선택하세요.');
  if (!draft?.bizType) fail('bizType', '사업구분을 선택하세요.');

  /*
   * ★대수와 계약연수는 반드시 있어야 접수된다★ (한백 지시 2026-09-22 「막아. 계약연수랑
   * 계약대수는 반드시 확인되어야만 접수되도록」).
   *
   * ★2026-09-14 의 반대다★ — 그때는 「기본 현장정보만 입력해서 일단 계약접수 할 수 있게」라
   * 경고로만 넘겼다. 서류는 며칠에 걸쳐 모이지만 ★대수와 연수는 계약서 첫 장에 찍혀 있다★ —
   * 나중에 오는 값이 아니다. 그런데 안 막으니 0 대인 현장이 아무 말 없이 나갔고(HB-2026-184),
   * 대수가 없으면 단가도 못 붙고 기성·지급 계획도 서지 않아 그 현장은 돈 쪽이 통째로 멈춘다.
   * 서류는 그대로 안 막는다 — 그 결정은 살아 있다.
   *
   * 연수는 라인마다 딸려 오므로 아래 검사가 함께 본다(5·7·10 이 아니면 거절).
   */
  if (lines.length === 0) {
    fail('qty', '계약대수를 적어주세요 — 계약서의 설치수량과 계약기간이 있어야 접수됩니다.');
  } else {
    lines.forEach((l, i) => {
      if (!l.qty || l.qty < 1) fail('qty', `계약 라인 ${i + 1}: 대수를 1 이상으로 입력하세요.`);
      if (![5, 7, 10].includes(l.termYears)) fail('termYears', `계약 라인 ${i + 1}: 계약기간을 선택하세요.`);
      if (draft.powerType === '한전불입+모자분리' && !l.powerType) {
        fail('qty', `계약 라인 ${i + 1}: 혼용 현장이므로 라인의 수전방식을 골라야 합니다.`);
      }
      /*
       * ★라인은 한 수전이다★ (2026-10-29) — 겸용은 현장의 값이고, 겸용이 아닌 현장의 라인은 현장 값과 같다. 접수 화면은
       * 늘 그렇게 보내지만 서버는 아무 본문이나 받는다 — 라인에 겸용이 들어가면 어느 단가 케이스와도 안 맞는다.
       */
      if (l.powerType && l.powerType !== '한전불입' && l.powerType !== '모자분리') {
        fail('qty', `계약 라인 ${i + 1}: 라인의 수전방식은 한전불입·모자분리 중 하나입니다.`);
      } else if (l.powerType && draft.powerType !== '한전불입+모자분리' && l.powerType !== draft.powerType) {
        fail('qty', `계약 라인 ${i + 1}: 현장 수전방식(${draft.powerType ?? '미지정'})과 다릅니다.`);
      }
    });
  }

  /*
   * ★겸용이면 두 수전 모두 1기 이상이어야 접수된다★ (한백 결정 2026-10-29).
   *
   * 결과서 「전력인입」에 모자분할·한전불입이 둘 다 체크된 현장은 실제로 둘 다 있다 — 결과서 9장 중 둘 다 체크인 1장
   * (매호효성백년가약)이 운영에서 9·2기로 나뉜 현장이다. 결과서에는 몇 기씩인지 적는 자리가 없어 협력사가 나눠 적는데,
   * 한 칸만 적어도 접수되면 대수 전부가 한쪽 단가로 계산된다 — 두 수전의 단가가 다른 운영사가 있다(나이스 공동주택
   * 10년 모자분리 영업 140만 · 한전불입 120만). 대수 칸에 적은 것을 겸용으로 옮기면 한 칸에 남아(lib/intake-qty) 이
   * 상태가 쉽게 생긴다. 라인이 아예 없으면 위의 「계약대수를 적어주세요」가 먼저 막는다.
   */
  if (draft?.powerType === '한전불입+모자분리' && lines.length > 0) {
    const has = (p: string) => lines.some((l) => l.powerType === p && l.qty > 0);
    if (!has('한전불입') || !has('모자분리')) {
      fail('qty', '한전불입·모자분리가 섞인 현장입니다 — 두 칸 모두 몇 기인지 적어주세요.');
    }
  }

  if (draft?.preInstall === '있음' && !draft.preNote?.trim()) {
    fail('preNote', '기설치 충전기가 있으므로 기설치 현황을 적어주세요.');
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
    // 아직 안 낸 계약이다 — 지금 생긴 필수 칸까지 다 받는다
    submittedOn: null,
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
    errors: issues.map((i) => i.message),
    issues,
    warnings,
    requiredCount: required.length,
    satisfiedCount: required.length - missing.length,
  };
}
