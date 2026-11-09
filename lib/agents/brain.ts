/**
 * 에이전트가 답한다 (서버 전용) — 업무 정의 · 열린 할 일 · 지금 콘솔 자료 · 지난 대화를 읽고 한백의 지시에 답한다.
 *
 * ★손에 쥔 것은 할 일 목록과 메일 초안뿐이다★ — add_task · complete_task · draft_mail, 양식 메일이 있는 운영사 담당은 site_mail
 * (나이스 계약서 초안 · 현대엔지니어링 설치승인서 — lib/site-mail), 전기차 정산 담당은 agit_post(아지트 열린구매 글 초안 — 한백이
 * 승인해야 올라간다, lib/agit). 반려 · 확정 · 단계 이동 · 지급 같은 콘솔의 값은 못 바꾼다(그건
 * 사람이 콘솔에서 누른다 — 판독이 반려하지 않는 것과 같은 원칙). 전략·기획만 웹 검색을 더 쥔다. 운영사 담당은 그 운영사의
 * 단가표를 읽는 pricing_table 을 쥔다 — 읽기만이다(lib/agents/pricing-table · 한백 2026-11-04 「영업정책 업데이트 되면 키단가표 업데이트」).
 * 계약서가 접수되면 콘솔이 그 담당의 이름으로 할 일 · 양식 메일 초안을 저절로 남긴다(말의 종류 auto) — 대화에서는 「[자동 …]」으로 읽는다.
 *
 * ★담당들은 팀이다★ (한백 2026-11-04 「전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야 … 상호보완구조」 —
 * lib/agents/team). 모두가 시스템에서 팀의 목표 · 방향을 읽고, 팀장(전략·기획)은 그것을 올리는 save_direction · delete_direction 을
 * 더 쥔다. ★팀원끼리 서로 읽고 서로에게 남긴다★(한백 2026-11-05 「각 담당자들끼리 서로 정보 공유 필요해. 즉 모든 에이전트들간
 * 대화필요」): 모두가 마지막 지시 곁에 다른 팀원들의 한 줄 현황([팀 현황])을 받고, team_history 로 팀원 하나를 깊이(낱말로는 기간
 * 상관없이) 읽고, tell_teammate 로 팀원의 대화에 말을 남긴다(받은 담당은 다음에 불릴 때 읽는다 — 저절로 부르지 않는다). 팀이 같이
 * 알아야 할 것은 팀 공용 메모에 적는다.
 *
 * ★장기기억은 메모장, 꺼내 쓰는 것은 그때그때★(한백 2026-11-05 「담당자가 내가 말한 모든 정보를 기억해주길 바래」 → 「모든 대화를 매번
 * 다 읽는건 너무 비효율적」 → 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」 — lib/agents/memory · memos).
 * 부를 때 읽는 것은 최근 대화 20~39개와 메모 제목뿐이다. 이번 말에 제목의 낱말이 나온 메모는 콘솔이 펼쳐 붙이고(왕복이 늘지 않는다),
 * 나머지는 담당이 open_memo 로 연다. 한백이 알려 준 사실 · 정한 것 · 바라는 방식은 담당이 save_memo 로 적는다. 메모에도 없으면
 * search_history(대화 원문 전부) · read_file(지난 파일)로 찾는다 — 대화가 쌓여도 부를 때 읽는 양이 그대로다.
 * ★메일은 초안까지다★ — 나가는 것은 한백이 그 초안의 「승인하고 보내기」를 눌렀을 때뿐이다(한백 2026-11-03 「난 그거에 대해
 * 승인을 하고 너가 메일을 보내는건데」 · app/api/agents/[id]/mails/[mailId]/send).
 *
 * 한백이 넘긴 파일(lib/agents/files)은 그 말에 붙여 읽는다 — PDF · 그림은 주소로 바로, 엑셀 · 워드 · 한글(hwpx) · 글 파일은
 * 서버가 글자를 뽑아서(lib/agents/file-text), 그 밖의 형식은 이름만.
 *
 * ★바뀌는 자료는 마지막 지시 곁에 둔다★ — 시스템에는 바뀌지 않는 것(역할 · 일하는 법 · 업무 정의)만 두고, 그때그때 바뀌는
 * 오늘 · 열린 할 일 · 콘솔 자료 · 팀원 · 메모는 마지막 지시 ★뒤에★ 붙인다. 그래야 지난 대화(넘긴 PDF 포함)가 캐시에서 싸게 읽힌다.
 * ★캐시 표지는 둘을 손으로 단다★(2026-11-05 실측 — 자동 표지 하나만 두었을 때 다음 지시에서 캐시 읽기가 0 이었다. 읽기는 앞 요청이
 * 표지를 단 자리에서만 맞는데, 자동 표지는 늘 지금 자료 뒤에 서고 지금 자료는 다음 요청에서 빠져서다): 시스템 끝(도구 · 시스템이
 * 늘 맞는다)과 마지막 지시의 지금 자료 바로 앞(다음 요청에서 그 앞의 대화 전부가 맞는다). 요청 끝의 자동 표지는 한 답 안의 바퀴용이다.
 *
 * 모델은 claude-opus-5-5 다 — 생각을 끌 수 없고(adaptive 가 늘 돈다) 강도는 effort 가 정한다. 설치된 SDK(0.52)가
 * output_config · 새 웹 검색 · 서버 대체(fallbacks)의 타입을 모르므로 요청 타입을 넓혀 보낸다(lib/survey/read-plate 와 같은 방식).
 * 거절(refusal)은 서버가 다른 모델로 이어 답하게 한다(fallbacks: "default").
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall, usdOf } from '@/lib/llm-usage';
import { solarApiKey } from '@/lib/solar/api-key';
import { agentFileRead } from './files';
import { fileText, fileTextsOf } from './file-text';
import { awaitsReply, pendingOf } from './memory';
import { MEMO_MAX, memoBlock, memosToOpen, memoText } from './memos';
import { attachable, bundleLinkLines, bundleText, type BundlePart, type BundleResult } from './bundle';
import { HEC_APPROVAL_MAIL, josa, siteMailOfCpo, type SiteMailSpec } from '@/lib/site-mail';
import type {
  Agent, AgentDuty, AgentFile, AgentMemo, AgentMemos, AgentMessage, AgentMessageMeta, AgentSource, AgentTask, AgentTeam, MemoScope,
} from '@/types/agents';
import { isLead } from '@/types/agents';
import type { PayoutKind } from '@/types/project';
import { directionsBlock, HISTORY_DAYS, teamLineOf, TELLS_PER_TURN } from './team';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
/*
 * 태양광 담당은 태양광 키로 부른다(lib/solar/api-key — 지붕 찾기와 같은 키). 태양광 AI에이전트는 전기차와 따로인 조직이라
 * (한백 2026-11-04 「태양광전용으로 하나 · 기존 전기차 AI에이전트에 붙이지 말고」) 돈도 Anthropic 콘솔에서 태양광 몫으로 선다.
 */
let solarClient: Anthropic | null = null;
const clientOf = (agent: Agent): Anthropic =>
  agent.biz === 'solar' ? (solarClient ??= new Anthropic({ apiKey: solarApiKey() })) : anthropic;
const MODEL = 'claude-opus-5-5';
/** 생각도 max_tokens 에 든다 — 아지트 글 초안처럼 긴 답이 잘리지 않게 넉넉히 */
const MAX_TOKENS = 16000;
/** 한 번 부르는 시간 — 라우트는 300초에 끊긴다(maxDuration) */
const CALL_TIMEOUT_MS = 110_000;
/** 도구를 쓰고 다시 부르는 것 · 웹 검색이 멈췄다 잇는 것까지 합친 상한 */
const MAX_ROUNDS = 6;
/** 이 시간이 지나면 다음 바퀴를 돌지 않는다 — 라우트가 끊기기 전에 받은 데까지 남긴다 */
const ROUND_BUDGET_MS = 170_000;
/** 웹 검색 한 번의 값(달러) — 1,000번에 10달러 */
const SEARCH_USD = 0.01;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'tools'> & {
  tools?: unknown[];
  output_config?: { effort?: 'low' | 'medium' | 'high' };
  cache_control?: { type: 'ephemeral' };
  fallbacks?: 'default';
};

/** 갈래마다의 일 — 업무 정의가 그 위에 얹힌다 */
function roleOf(agent: Agent): string {
  if (agent.biz === 'solar') return solarRoleOf(agent);
  switch (agent.kind) {
    case 'operator': {
      const spec = siteMailOfCpo(agent.cpo);
      return `${agent.cpo} 운영사와 관련된 일을 맡는다. ${agent.cpo} 현장들이 접수부터 준공까지 막히지 않고 흘러가게 챙기고, `
        + `${agent.cpo} 쪽과 오간 일을 기록한다. [현장] 자료의 「칸」은 그 현장이 선 단계, 「차례」는 지금 움직여야 할 쪽 `
        + '(한백 · 영업사 · 시공사), 「정체」는 마지막 진척 뒤 지난 날수다.\n'
        + `단가표: 콘솔의 ${agent.cpo} 단가표(단가 케이스)는 pricing_table 로 읽는다 — 읽기만 한다. 한백이 새 영업정책 원자료를 주면 `
        + '지금 단가표와 견주어 바뀌는 케이스(적용 시작 · 건물 · 연수 · 수전 · 턴키 · 프로모션 · 충전요금 · 조건)와 새로 생기거나 '
        + '없어지는 케이스를 정리한다. 단가표에 넣는 것은 한백이 한다.'
        + (spec ? `\n${siteMailRole(spec)}` : '');
    }
    case 'settlement':
      return '정산을 맡는다 — 세 가지다.\n'
        + '1) 기성관리: 한백이 운영사에게서 받을 돈(기성)을 챙긴다. [기성관리] 자료가 청구 · 수금할 차례다.\n'
        + '2) 지급관리: 협력사(영업사 · 시공사)에게 줄 영업비 · 시공비. 지급은 배치(지급처 × 구분 × 지급일)로 묶여 가확정 → 확정 → '
        + '지급완료로 간다. 가확정이면 협력사가 세금계산서를 발행할 차례이고, 확정 누락은 지급일이 지났는데 확정을 건너뛴 것이다.\n'
        + '3) 열린구매: 지급을 위해 한백 사내 아지트에 지출 글을 올리고 붙일 자료를 챙긴다. [열린구매] 자료가 재료다. '
        + '★아지트 글은 결제일 × 구분(영업비 · 시공비)마다 하나 · 콘솔이 짓는다★ — 같은 날 나가도 시공비는 따로 올린다(한백 11-09). 모양은 '
        + '같고 말만 「영업위탁 수수료」 대신 「시공비」다. 그날 나가는 그 구분의 배치 전부를 콘솔이 거래명세서로 짓는다. 모양은 한백이 올려 온 '
        + '구매요청간소화 글 그대로다(마크다운): #구매요청간소화 · # 배경(공사명 · 상황설명) · # 구매 내역(엑셀 캡처 그림만 — 글자는 없다) · '
        + '# 기한(정기결제일) · # 청구 금액(부가세 전 · 포함) · # 참고자료(지급처마다 거래명세서 고리), 그리고 글 밑에 첨부 zip(구매요청간소화 '
        + '엑셀 · 캡처 · 거래명세서 · 세금계산서)이 진짜 첨부 파일로 붙는다. 엑셀은 한백이 쓰던 양식을 틀로 채우고, 캡처 · zip 은 올릴 때 붙는다. '
        + '★긴급 글★: 한백이 긴급으로 올리라고 하면 agit_post 의 urgent_reason 에 긴급사유를 넣는다 — 콘솔이 한백의 긴급구매요청 글 '
        + '모양(# [긴급] 공사명 #긴급구매요청 · 지급 요청일 · 1. 구매사유 · 2. 지급요청 품목(청구 금액 · 엑셀 캡처) · 3. 긴급사유 기재 · '
        + '참고자료 · 끝에 cc @@team.finance)으로 짓고 글양식도 긴급구매요청이 된다. 사유는 한백의 말 그대로 — 지어내지 않고, '
        + '말하지 않았으면 묻는다. 긴급을 풀라고 하면 urgent_reason 을 빈 글("")로, 그냥 다시 지으라고 하면 urgent_reason 을 빼서 지금 모양을 '
        + '그대로 둔다. 상신 기한(결제일 3영업일 전)이 지났다고 저절로 긴급이 아니다 — 한백이 정한다. 기한이 지났는데 한백이 말하지 않았으면 '
        + '보통 글로 짓고 「기한이 지났으니 긴급으로 바꿀 수 있다」고 한 줄 짚는다. cc @@team.finance 는 긴급 글에만 붙는다. '
        + '아지트 글을 네가 따로 쓸 때 굵게는 *글*(별 하나)이다 — ** 는 글자 그대로 보인다. '
        + '콘솔에 없는 지급(예: 25년 사업 잔금처럼 콘솔 밖 현장)은 글 · 엑셀 · zip 에 저절로 들어가지 않는다 — 한백이 그 거래명세서 · '
        + '세금계산서를 넘기며 이번 지급에 넣으라고 하면, 지금 콘솔 초안에는 넣을 수 없다고 말하고 Claude Code 로 더하라고 알린다. '
        + '협력사 정보에 계좌가 없는 지급처(채움에스앤시처럼 콘솔 계정이 없는 곳)는 엑셀의 은행 · 계좌가 「-」로 빈다 — 짚는다. 결제일 3영업일 전 아침에 콘솔이 네 이름으로 상신 할 일과 그 글의 초안을 이 대화에 저절로 올린다. '
        + '한백이 아지트 글을 올려 달라 · 초안을 보여 달라고 하면 agit_post(결제일)로 초안을 이 답 밑에 올린다 — 그날 나가는 구분마다 '
        + '하나씩 선다(한 구분만이면 kind). 금액 · 계좌를 네가 옮겨 적지 않는다. 이미 올린 결제일 · 구분은 한백이 다시 올리라고 할 때만 again. ★너도 콘솔도 아지트에 올리지 못한다★ — 아지트에는 '
        + 'Claude Code 가 한백의 아지트 계정으로 올린다(한백 11-09: 봇 글은 한백이 고칠 수 없고 파일을 못 붙였다). 한백이 올리라고 하면 '
        + '「Claude Code 에 『○월 ○일 열린구매 올려』라고 해 주세요」라고 답한다. Claude Code 가 그때 금액으로 다시 지어 견주고, 글양식 · '
        + '본문 · 엑셀 캡처 · 첨부 zip · 요청 담당(한백이 「요청 담당」에 정해 둔 아지트 ID)을 넣어 올린다 — 한백이 쓴 글이라 한백이 고친다. '
        + '올리면 그 결제일의 상신 할 일이 저절로 끝나고 대화에 「아지트에 올렸습니다」 한 줄이 선다. '
        + '한백이 따로 써 달라고 할 때만 [열린구매] 자료로 글을 쓴다. 붙일 자료는 자료 줄에 있는 것(거래명세서 주소 · 세금계산서 · '
        + '사업자등록증 · 통장사본)을 보고 없는 것은 없다고 짚는다.';
    case 'strategy':
      return '시장 정보를 모으고 전략·기획을 맡는다. 전기차 충전 인프라 시장(환경부 보조금 정책 · 운영사 동향 · 공동주택 충전기 '
        + '설치 의무 · 경쟁 시공사)을 웹 검색으로 찾아보고, [수주 흐름]과 견주어 한백에 필요한 것을 정리한다. '
        + '찾아본 사실에는 출처를 밝히고, 추측과 사실을 가른다.';
    case 'owner':
      return solarRoleOf(agent);
  }
}

/**
 * 태양광 담당의 일 (한백 지시 2026-11-04 「태양광도 AI 에이전트 붙여줘. 운영사 담당자가 아니라 사업자 담당자 … 나머지는 동일하게」).
 * 전기차와 같은 조직이고 운영사 자리가 사업자다. 태양광 콘솔에는 아직 상담 접수한 현장뿐이라(lib/agents/solar-brief) 나머지는
 * 한백이 대화 · 업무 정의 · 넘긴 파일로 준다 — 모르는 것은 지어내지 말고 묻는다(일하는 법).
 */
function solarRoleOf(agent: Agent): string {
  switch (agent.kind) {
    case 'owner':
    case 'operator': {
      const who = agent.company ?? '맡은 사업자';
      return `${who} 사업자와 관련된 일을 맡는다. ${who} 쪽과 오간 일(통화 · 메일 · 받은 자료)을 기록하고, ${josa(who, '과', '와')} 함께 하는 `
        + '현장 · 서류 · 일정이 막히지 않게 챙긴다. [태양광 현장] 자료는 상담 접수한 전체 현장이다 — 현장에 사업자가 아직 적히지 '
        + `않아, 그중 ${who}의 현장은 대화 · 업무 정의 · 넘긴 파일로 안다.`;
    }
    case 'settlement':
      return '태양광 정산을 맡는다 — 받을 돈(기성) · 협력사에게 줄 돈(지급) · 지급을 위한 열린구매(한백 사내 아지트에 올릴 지출 글과 '
        + '붙일 자료). 콘솔에는 아직 태양광의 기성 · 지급 기록이 없다 — 한백이 대화로 주는 내용과 넘긴 파일(계약서 · 세금계산서 · '
        + '거래명세서 같은 것)로 일한다. 글의 양식과 꼭 들어갈 항목은 업무 정의를 따른다. 아지트에 올리는 것은 아직 네가 하지 못한다 — '
        + '글을 다 쓰면 한백이 올린다.';
    case 'strategy':
      return '태양광 시장 정보를 모으고 전략·기획을 맡는다. 태양광 시장(정부 재생에너지 정책 · RPS · REC · SMP 가격 · 계통 접속 여유 · '
        + '지붕형 · 지상형 수익 구조 · 사업자 · 경쟁 시공사 동향)을 웹 검색으로 찾아보고, [태양광 수주 흐름]과 견주어 한백에 필요한 '
        + '것을 정리한다. 찾아본 사실에는 출처를 밝히고, 추측과 사실을 가른다.';
  }
}

/** 시스템의 첫 줄 — 한백이 하는 사업. 담당의 사업 쪽을 말한다 */
function companyLineOf(agent: Agent): string {
  if (agent.biz === 'solar') {
    return '한백은 신재생 에너지 사업을 한다 — 전기차 충전기 설치와 태양광이다. 태양광에서 한백은 건물 지붕 · 땅에 태양광을 놓을 '
      + '부지를 검토하고, 협력사가 상담을 접수하면 현장으로 관리하며, 사업자와 함께 일한다. 너는 그 태양광 쪽의 담당이다.';
  }
  return '한백은 전기차 충전기 설치 사업을 한다 — 운영사(충전사업자)와 계약해 아파트 등에 충전기를 놓고, 영업사 · 시공사 '
    + '협력사에게 하도급을 준다.';
}

/** 양식 메일이 있는 운영사 담당의 몫 — 접수 때 저절로 쓰는 것과, 서류가 채워져 한백이 다시 요청할 때 쓰는 도구 */
function siteMailRole(spec: SiteMailSpec): string {
  return `현장 양식 메일: 계약서가 접수된 ${spec.cpo} 현장마다 「${spec.label}」(${spec.doc} 첨부)을 보낸다. 접수되면 콘솔이 네 이름으로 `
    + `할 일을 적고 초안을 쓴다(「[자동 …]」). ${josa(spec.doc, '이', '가')} 없으면 못 보낸다고 남기고 할 일을 열어 둔다. `
    + `${josa(spec.doc, '이', '가')} 채워져 한백이 다시 요청하면 site_mail 로 초안을 올린다 — 이 메일은 draft_mail 로 쓰지 않는다. `
    + `그 메일이 나가면 「${spec.label} 보내기」 할 일은 저절로 끝난다 — complete_task 로 끝내지 않아도 된다.`
    + (spec.kind === HEC_APPROVAL_MAIL
      ? ` 콘솔은 초안을 쓰기 전에 붙일 ${josa(spec.doc, '이', '가')} 이 현장의 것인지 본다(양식 · 빈 양식 · 주소 · 기수). 맞지 않으면 초안을 쓰지 않고 `
        + '까닭을 남긴다 — 한백에게 그 까닭을 그대로 전한다. 한백이 까닭을 듣고도 그대로 쓰라고 하면 site_mail 의 force 를 켠다(스스로 켜지 않는다). '
        + '초안에 「확인 필요」(기수가 다름 · 못 읽음)가 붙으면 그것도 전한다.'
      : '');
}

const RULES = `일하는 법:
- 한국어로, 짧고 구체적으로 답한다. 현장은 관리번호와 이름으로 짚는다.
- 숫자와 사실은 자료와 대화에 있는 것만 쓴다. 자료에 없으면 없다고 말하고 지어내지 않는다.
- 표 · 굵은 글씨 · 제목(#) 같은 마크다운은 쓰지 않는다. 줄바꿈과 「- 」 목록만 쓴다 — 화면이 글자를 그대로 보여준다.
- 너는 콘솔의 값을 바꾸지 못한다. 반려 · 확정 · 단계 이동 · 지급은 사람이 콘솔에서 한다. 필요하면 무엇을 누가 해야 하는지 말한다.
- 한백이 맡긴 일 · 다시 확인할 일 · 기한이 있는 일은 add_task 로 할 일에 적는다. 같은 할 일이 이미 열려 있으면 또 적지 않는다.
  한백이 끝났다고 알려 준 할 일은 complete_task 로 끝낸다. 적거나 끝냈으면 답에 한 줄로 말한다.
- 「[기록 …]」으로 시작하는 말은 한백이 남긴 기록이다(운영사 · 사업자 담당자와 통화한 내용 같은 것). 답을 바라는 말이 아니지만 근거로 쓴다.
- 「[넘긴 파일 …]」은 한백이 너에게 준 파일이다. 읽을 수 있으면 읽고 근거로 쓴다. 이름만 알고 열지 못한 파일은 그렇다고 말한다.
- 기억은 메모장에 둔다. 대화는 최근 것만 실려 있다 — 그 앞의 일은 메모와 search_history 로 안다.
  「[메모 …]」는 네 메모와 팀 공용 메모의 제목이고, 이번 말에 제목의 낱말이 나온 메모는 「[펼친 메모 …]」로 붙어 있다.
  지시와 관련 있어 보이는 메모가 펼쳐지지 않았으면 open_memo 로 연다. 한백에게 다시 묻기 전에 메모 → search_history 순으로 찾는다.
  한백이 전에 말한 것을 다시 묻지 않는다. 지난 파일은 read_file 로 다시 연다.
- 업무 정의는 한백이 정한다. 한백이 업무 정의에 넣어 달라 · 고쳐 달라 · 빼 달라고 하면 save_duty · delete_duty 로 그 답에서 바로 하고
  한 줄로 말한다 — 권한이 없다고 하지 않는다. 고칠 때는 같은 줄(id)을 고치고, 내용은 앞의 것을 살려 전체를 다시 쓴다. 한백이 시키지
  않은 업무 정의는 바꾸지 않는다 — 바꾸면 좋겠다 싶으면 답에 제안만 한다. 업무 정의는 일하는 규칙이고, 들은 사실은 메모에 적는다.
- 한백이 알려 준 사실(사람 · 연락처 · 숫자 · 일정 · 조건) · 정한 것 · 바라는 방식 · 고쳐 준 것은 그 답에서 save_memo 로 남긴다.
  같은 주제의 메모가 있으면 새로 만들지 않고 그 메모에 덧붙이거나(append) 고친다. 팀원도 알아야 하면 팀 공용(scope team)에 적는다.
  제목은 콘솔이 메모를 펼치는 낱말이다 — 운영사 · 사업자 · 현장 번호 · 사람 · 주제를 「 · 」로 잇는다(예: 나이스인프라 · 김민수 대리 · 세금계산서).
  내용은 짧게, 날짜와 누가 말했는지를 붙인다. 비밀번호 같은 비밀은 적지 않는다. 적었으면 답에 한 줄로 말한다.
- 「[팀원 …]」으로 시작하는 말은 같은 팀의 다른 담당이 너에게 남긴 것이다 — 한백의 지시가 아니다. 근거로 쓰고, 맡을 일이면
  할 일에 적고, 그 팀원이 알아야 할 답이 있으면 tell_teammate 로 돌려준다.
- 「[지금 …]」으로 시작하는 덩이는 마지막 지시를 받은 때의 콘솔 자료다 — 한백이 쓴 말이 아니다.
- 「[자동 …]」으로 시작하는 말은 콘솔이 규칙대로 네 이름으로 한 일이다(계약서가 접수되면 할 일 · 양식 메일 초안). 네가 한 일로 알고 이어서 챙긴다.
- 메일은 draft_mail 로 초안만 올린다. 너는 메일을 보내지 못한다 — 한백이 초안을 보고 「승인하고 보내기」를 눌러야 나간다.
  업무 정의에 메일을 보내는 경우와 양식이 있으면 그대로 따르고, 한백이 메일을 쓰라고 할 때나 업무 정의가 정한 경우에만 올린다.
  받는 사람 주소는 업무 정의 · 대화 · 자료에 적힌 것만 쓴다. 모르면 초안을 올리지 말고 누구에게 보낼지 묻는다.
  초안을 올렸으면 답에 한 줄로 말하고(본문을 답에 다시 옮겨 적지 않는다), 같은 메일을 두 번 올리지 않는다.
  한백이 정한 날에 보내라고 하면 초안을 올리고, 카드의 「예약」으로 그날을 고르면 그날 오전 9시대에 나간다고 알려 준다 — 예약은 한백이
  카드에서 한다(승인이라서). 시각은 고를 수 없고 오전 9시대뿐이다.
  여러 현장의 서류를 한 통으로 보내야 하면 bundle_site_docs(관리번호들 + 서류 칸 이름)로 콘솔이 묶게 하고, 묶음마다 draft_mail 의
  attach_bundle_ids 로 한 통씩 쓴다 — 한 통에 들어갈 만큼씩 나뉘니 제목 · 본문에는 그 묶음에 든 현장만 쓴다. 한백에게 파일을 모아
  올려 달라고 하지 않는다. 뺀 현장 · 나눈 수는 답에 그대로 전한다.`;

/** 시스템 — 업무 정의. 고칠 줄의 id 를 같이 준다(save_duty · delete_duty — 한백이 시킬 때만) */
function dutiesBlock(duties: AgentDuty[]): string {
  if (duties.length === 0) {
    return '[업무 정의]\n아직 한백이 정한 업무 정의가 없다. 위 역할대로 일하고, 업무 정의를 적어 달라고 한 번 말한다.';
  }
  return [
    '[업무 정의 — 한백이 정한 것. 이것이 너의 일이다]',
    ...duties.map((d, i) => `${i + 1}. ${d.title} (id=${d.id})${d.body.trim() ? `\n${d.body.trim()}` : ''}`),
  ].join('\n');
}

function tasksBlock(tasks: AgentTask[]): string {
  const open = tasks.filter((t) => !t.doneAt);
  if (open.length === 0) return '[열린 할 일]\n- 없음';
  return [
    '[열린 할 일]',
    ...open.map((t) => `- id=${t.id} | ${t.title}${t.due ? ` | 기한 ${t.due}` : ''}`
      + `${t.projectName ? ` | 현장 ${t.projectName}` : ''}${t.note ? ` | ${t.note}` : ''} | 적은 쪽 ${t.author}`),
  ].join('\n');
}

/**
 * 넘긴 파일 하나를 읽을 덩이로 — PDF · 그림은 주소로, 글자를 뽑은 것은 글로, 그 밖은 이름만.
 * 머리에 id 를 단다 — 메일 초안에 그 파일을 붙일 때(draft_mail attach_file_ids) 쓴다.
 */
function fileBlocks(f: AgentFile, texts?: Map<string, string>): Anthropic.ContentBlockParam[] {
  const head = `[넘긴 파일 ${f.name} · id=${f.id}]`;
  switch (agentFileRead(f.name)) {
    case 'pdf':
      return [{ type: 'text', text: head }, { type: 'document', source: { type: 'url', url: f.url }, title: f.name }];
    case 'image':
      return [{ type: 'text', text: head }, { type: 'image', source: { type: 'url', url: f.url } }];
    default: {
      const t = texts?.get(f.id);
      return [{ type: 'text', text: t ? `${head} — 글자만 뽑음\n${t}` : `${head} — 이 형식은 열지 못한다. 이름만 안다` }];
    }
  }
}

/**
 * 지난 대화를 메시지로 — 기록(note)은 한백의 말로 넣되 머리에 표지를 단다. 맨 앞은 사람의 말이어야 한다.
 * 파일이 붙은 말은 글 덩이 뒤에 파일 덩이가 붙는다(texts — 파일 id → 뽑은 글자, lib/agents/file-text).
 */
export function toMessages(history: AgentMessage[], texts?: Map<string, string>): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = history.map((m) => {
    if (m.role === 'agent') return { role: 'assistant' as const, content: m.body };
    // 자동의 말은 모델이 쓴 말이 아니다 — 표지를 단 기록으로 넣는다(대화 맨 앞에 와도 빠지지 않게)
    if (m.role === 'auto') return { role: 'user' as const, content: `[자동 — ${m.author} · ${m.at}] ${m.body}` };
    // 팀원의 말도 이 담당이 쓴 말이 아니다 — 보낸 담당의 이름을 단 표지로(한백의 지시와 갈리게)
    if (m.role === 'peer') return { role: 'user' as const, content: `[팀원 — ${m.author} · ${m.at}] ${m.body}` };
    const head = m.role === 'note' ? `[기록 — ${m.author} · ${m.at}] ${m.body}` : `[${m.author} · ${m.at}] ${m.body}`;
    if (!m.files?.length) return { role: 'user' as const, content: head };
    return {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: head }, ...m.files.flatMap((f) => fileBlocks(f, texts))],
    };
  });
  while (out.length > 0 && out[0].role === 'assistant') out.shift();
  return out;
}

/**
 * 마지막 말 뒤에 지금의 자료를 붙이고, 그 바로 앞에 캐시 표지를 단다 — 다음 요청에서는 지금 자료가 빠지므로, 표지가 그 앞에 있어야
 * 다음 요청이 여기까지의 대화를 캐시에서 읽는다(읽기는 앞 요청이 표지를 단 자리에서만 맞는다). 표지는 바이트가 아니라 자리라 다음
 * 요청에서 빠져도 앞부분을 바꾸지 않는다.
 */
export function withContext(messages: Anthropic.MessageParam[], context: string): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] = typeof last.content === 'string'
    ? [{ type: 'text', text: last.content }]
    : [...last.content];
  const end = blocks.length - 1;
  blocks[end] = { ...blocks[end], cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam;
  return [...messages.slice(0, -1), { role: last.role, content: [...blocks, { type: 'text', text: context }] }];
}

/** 에이전트가 쥔 손 — 라우트가 저장소에 이어 준다(이 파일은 저장소를 모른다) */
export interface AgentHands {
  addTask(input: { title: string; note: string | null; due: string | null; projectId: string | null }): Promise<string>;
  completeTask(id: string): Promise<string>;
  /** 메일 초안 올리기 — 저장소가 주소 · 길이 · 붙일 파일을 보고 틀리면 사람 말로 던진다(그 말이 도구 결과로 돌아간다). id 를 돌려준다 */
  draftMail(input: {
    to: unknown; cc: unknown; subject: string; body: string; fileIds: string[];
    /** 콘솔이 묶어 올린 현장 서류 zip(bundleSiteDocs) */
    docFiles?: Array<{ name: string; url: string; size: number; contentType: string | null }>;
  }): Promise<string>;
  /**
   * 여러 현장의 같은 서류를 한 통에 들어갈 만큼씩 zip 으로 나눠 묶어 올린다 — 전기차 담당만(lib/agents/bundle-run). 묶을 파일이 없으면
   * 사람 말로 던진다
   */
  bundleSiteDocs?(input: { sites: string[]; doc: string; maxMb: number | null }): Promise<BundleResult>;
  /** 앞서 올린 묶음 하나(id) — 뒤의 답에서 붙일 때. 이 담당의 것이 아니면 null */
  bundleFile?(id: string): Promise<BundlePart['zip'] | null>;
  /** 관리번호(또는 현장 id) → 현장 id. 모르면 null */
  siteOf(ref: string): string | null;
  /**
   * 현장 양식 메일 초안 — 양식이 있는 운영사 담당만(lib/site-mail). 지금 서류로 쓰고, 붙일 서류가 없거나 맞지 않으면 사람 말로 던진다.
   * plan: create 새로 · replace 앞의 보내지 않은 초안을 버리고 새로 · keep 같은 초안이 이미 있다. checks 는 카드의 「확인 필요」.
   * force — 맞지 않다는 까닭을 한백이 듣고도 쓰라고 했을 때
   */
  siteMail?(projectId: string, force: boolean): Promise<{ id: string; subject: string; plan: string; to: string[]; checks: string[] }>;
  /** 그 운영사의 지금 단가표 글 — 운영사 담당만(lib/agents/pricing-table). 읽기만이다 */
  pricingTable?(): Promise<string>;
  /**
   * 아지트 열린구매 글 초안 — 전기차 정산 담당만(store/agit draftAgitPost). 결제일 × 구분(영업비 · 시공비)마다 하나 — kind 를 빼면 그날
   * 나가는 구분마다 짓는다. 못 지은 구분(지급 0건 · 지급처 미정 · 이미 올렸는데 again 이 아님)은 skipped 에 까닭과 함께, 하나도 못 지었으면
   * 사람 말로 던진다. plan: create 새로 · refresh 고침 · keep 같은 글
   */
  agitDraft?(input: {
    payDate: string;
    again: boolean;
    /** 긴급사유 — 글이면 긴급 글 · 빈 글이면 보통 글로 되돌림 · 없으면(undefined) 지금 초안의 모양 그대로 */
    urgent?: string;
    /** 그 구분만 — 없으면 그날 나가는 구분마다 */
    kind?: PayoutKind;
  }): Promise<{
    made: {
      id: string; plan: 'create' | 'refresh' | 'keep'; name: string; kind: PayoutKind; batches: number; total: number;
      /** 지은 글의 긴급사유 — null 이면 보통 글 */
      urgent: string | null;
    }[];
    skipped: { kind: PayoutKind; why: string }[];
  }>;
  /** 팀장만 — 팀 목표 · 방향 올리기(id 없이) · 고치기(id). 저장소가 틀리면 사람 말로 던진다 */
  saveDirection?(input: { id: string | null; title: string; body: string }): Promise<{ id: string; title: string }>;
  /** 팀장만 — 팀 목표 · 방향 지우기. 지운 줄의 이름을 돌려준다 */
  deleteDirection?(id: string): Promise<string>;
  /**
   * 팀원 하나가 한백 · 팀원과 나눈 것(lib/agents/team teamHistoryOf). query 를 주면 날수와 상관없이 그 팀원의 대화 전부에서
   * 찾는다(store/agent-memory searchAgentMessages). 모르는 팀원이면 사람 말로 던진다
   */
  teamHistory?(member: string, days: number, query?: string): Promise<string>;
  /** 팀원의 대화에 말을 남긴다 — 받은 팀원의 이름을 돌려준다. 모르는 팀원 · 다른 사업이면 사람 말로 던진다 */
  tellTeammate?(member: string, body: string): Promise<string>;
  /** 이 대화창의 원문 찾기 — 담당이 읽을 글(lib/agents/memory searchText)을 돌려준다 */
  searchHistory?(q: { query: string; from: string; to: string }): Promise<string>;
  /** 이 담당에게 넘긴 파일 하나 — 아니면 null */
  readFile?(id: string): Promise<AgentFile | null>;
  /** 메모 넣기(id 없이) · 고치기(id) · 덧붙이기(append) — 저장소가 틀리면 사람 말로 던진다 */
  saveMemo?(input: {
    scope: MemoScope; id: string | null; title?: string; body?: string; append?: boolean;
  }): Promise<{ id: string; title: string }>;
  /** 메모 지우기 — 지운 메모의 이름 */
  deleteMemo?(input: { scope: MemoScope; id: string }): Promise<string>;
  /** 업무 정의 넣기(id 없이) · 고치기(id) — 한백이 시킬 때만. 줄의 id 를 돌려준다 */
  saveDuty?(input: { id: string | null; title: string; body: string }): Promise<string>;
  /** 업무 정의 빼기 — 뺀 줄의 이름 */
  deleteDuty?(id: string): Promise<string>;
}

/** 한 답에서 적는 메모 상한 — 잘못 돈 답이 메모장을 채우지 않게 */
const MEMOS_PER_TURN = 6;

/**
 * 한 답에 올리는 메일 초안 상한 — 잘못 돈 답이 초안을 쏟아 내지 않게. 여러 현장 묶음이 한 통 20MB 안으로 나뉘면 묶음마다 한 통이라
 * 셋으로는 모자랐다(현대 16개소 62.6MB → 넷, 2026-11-05)
 */
const MAILS_PER_TURN = 8;

/**
 * 할 일 적기 — 전기차 담당은 관련 현장(관리번호)을 붙인다. 태양광 담당은 붙이지 않는다: 할 일의 현장 칸은 전기차 현장이고
 * (agent_tasks.project_id), 태양광 현장(SL-…)을 가리킬 자리는 아직 없다 — 현장 번호는 할 일 글에 적는다.
 */
function addTaskTool(withSite: boolean) {
  return {
    name: 'add_task',
    description: '이 담당의 할 일 목록에 한 줄을 적는다. 한백이 맡긴 일 · 다음에 다시 확인할 일 · 기한이 있는 일을 남길 때 쓴다. '
      + '이미 열린 같은 할 일이 있으면 쓰지 않는다.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '할 일 한 줄 — 무엇을 할지 (120자 이내)' },
        note: { type: 'string', description: '덧붙일 말 — 근거 · 연락처 등 (선택)' },
        due: { type: 'string', description: '기한 YYYY-MM-DD (선택)' },
        ...(withSite ? { site: { type: 'string', description: '관련 현장의 관리번호, 예: HB-2026-123 (선택)' } } : {}),
      },
      required: ['title'],
    },
  };
}

const COMPLETE_TASK_TOOL = {
  name: 'complete_task',
  description: '열린 할 일을 끝냈다고 표시한다. 한백이 끝났다고 알려 준 할 일만 끝낸다.',
  input_schema: {
    type: 'object',
    properties: { task_id: { type: 'string', description: '[열린 할 일]의 id' } },
    required: ['task_id'],
  },
};

/**
 * 메일 초안 — 전기차 담당은 bundle_site_docs 로 묶은 현장 서류를 attach_bundle_ids 로 붙인다(lib/agents/bundle · 한백 2026-11-05
 * 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로」 · 「B로하자」 — 첨부로만, 한 통에 들어갈 만큼씩).
 * 태양광 현장의 파일은 아직 묶지 않는다.
 */
function draftMailTool(withBundles: boolean) {
  return {
    name: 'draft_mail',
    description: '한백이 승인할 메일 초안을 올린다. 너는 메일을 보내지 못한다 — 한백이 초안을 보고 「승인하고 보내기」를 눌러야 나간다. '
      + '업무 정의에 정해진 경우 · 양식이 있으면 그대로 따른다. 받는 사람 주소는 업무 정의 · 대화 · 자료에 적힌 것만 쓰고 지어내지 않는다.'
      + (withBundles
        ? ' bundle_site_docs 로 묶은 현장 서류는 attach_bundle_ids 로 붙인다 — 묶음이 여럿이면 묶음마다 한 통씩, 제목 · 본문에는 그 묶음에 든 '
          + '현장만 쓴다. 한 현장만으로 상한을 넘은 묶음만 link_bundle_ids 로 본문에 내려받기 링크를 단다.'
        : ''),
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: '받는 사람 메일 주소들' },
        cc: { type: 'array', items: { type: 'string' }, description: '참조 메일 주소들 (선택)' },
        subject: { type: 'string', description: '제목 (200자 이내)' },
        body: { type: 'string', description: '본문 — 줄바꿈이 그대로 나간다. 마크다운을 쓰지 않는다' },
        attach_file_ids: {
          type: 'array', items: { type: 'string' }, description: '붙일 파일 — 「[넘긴 파일 … · id=…]」의 id (선택)',
        },
        ...(withBundles ? {
          attach_bundle_ids: {
            type: 'array', items: { type: 'string' }, description: '첨부로 붙일 묶음 — bundle_site_docs 가 돌려준 묶음의 id (선택)',
          },
          link_bundle_ids: {
            type: 'array', items: { type: 'string' },
            description: '첨부로 못 붙는 묶음(한 현장만으로 상한을 넘은 것)의 id — 본문 끝에 내려받기 링크로 단다 (선택)',
          },
        } : {}),
      },
      required: ['to', 'subject', 'body'],
    },
  };
}

/**
 * 아지트 열린구매 글 초안 — 전기차 정산 담당만(라우트가 손을 이어 줄 때). 글은 콘솔이 거래명세서로 짓고(lib/agit/post), 담당은
 * 결제일만 고른다 — 금액 · 계좌를 담당이 옮겨 적지 않는다. 한백이 승인해야 올라간다(한백 2026-11-08 「내가 승인하면
 * 정산담당에이전트가 아지트에 글을 올리는 구조」).
 */
const AGIT_POST_TOOL = {
  name: 'agit_post',
  description: '그 결제일의 아지트 열린구매 글 초안을 이 답 밑에 올린다 — 구분(영업비 · 시공비)마다 한 글이라 그날 둘 다 나가면 둘이 선다. '
    + '글은 콘솔이 거래명세서(그날 나가는 그 구분의 배치 전부)로 한백의 '
    + '구매요청간소화 양식대로 짓는다(배경 · 구매 내역(엑셀 캡처) · 기한 · 청구 금액 · 참고자료 — 캡처 · 첨부 zip 은 올릴 때 붙는다) — 너는 결제일만 준다. '
    + '시공비 글은 같은 모양에 말만 「시공비」다. '
    + 'urgent_reason 을 주면 긴급구매요청 양식(긴급사유 · cc 재무팀)으로 짓는다. 같은 결제일 · 구분의 승인 전 초안이 있으면 지금 금액으로 고쳐 이 답 밑으로 옮긴다. '
    + '너는 아지트에 올리지 못한다 — 한백이 Claude Code 에 「○월 ○일 열린구매 올려」라고 해야 한백의 계정으로 올라간다. 이미 올린 결제일 · 구분은 한백이 다시 올리라고 할 때만 again.',
  input_schema: {
    type: 'object',
    properties: {
      pay_date: { type: 'string', description: '결제일 YYYY-MM-DD — 배치의 지급일([열린구매] 자료의 날짜)' },
      again: { type: 'boolean', description: '이미 올린 결제일 · 구분을 다시 올리는 초안인가 — 한백이 다시 올리라고 했을 때만 true (선택)' },
      kind: {
        type: 'string', enum: ['영업비', '시공비'],
        description: '그 구분의 글만 — 한백이 한쪽만 말했을 때(예: 시공비 글만 긴급으로). 빼면 그날 나가는 구분마다 하나씩 (선택)',
      },
      urgent_reason: {
        type: 'string',
        description: '긴급 글로 지을 때의 긴급사유 — 한백이 긴급으로 올리라고 할 때만, 한백이 말한 사유 그대로(「3. 긴급사유 기재」에 들어간다, '
          + '예: 세금계산서 발행 지연으로 늦은 상신). 빈 글("")이면 긴급을 풀고 보통 글로 되돌린다. 빼면 지금 초안의 모양(긴급 · 보통) 그대로 (선택)',
      },
    },
    required: ['pay_date'],
  },
};

/** 여러 현장의 같은 서류를 묶는다 — 전기차 담당(라우트가 손을 이어 줄 때). 묶기만 하고, 메일은 draft_mail 로 묶음마다 쓴다 */
const BUNDLE_TOOL = {
  name: 'bundle_site_docs',
  description: '여러 현장의 같은 서류(설치승인서 · 계약서 등 콘솔 현장에 올라가 있는 서류 칸)를 zip 으로 묶는다. 한 통에 첨부로 들어갈 만큼씩 '
    + '(기본 20MB) 현장을 쪼개지 않고 나눠 묶고, 묶음마다 id 를 돌려준다 — 그 id 로 draft_mail 의 attach_bundle_ids 에 붙여 묶음마다 '
    + '한 통씩 초안을 쓴다. 한백에게 파일을 모아 올려 달라고 하지 않는다. 운영사 담당은 제 운영사 현장만 묶인다.',
  input_schema: {
    type: 'object',
    properties: {
      sites: { type: 'array', items: { type: 'string' }, description: '현장 관리번호들, 예: HB-2026-270' },
      doc: { type: 'string', description: '서류 칸 이름 — 콘솔 서류 칸의 이름대로, 예: 설치승인서 · 계약서 · 사업자등록증' },
      max_mb: { type: 'number', description: '메일 한 통에 붙일 묶음의 크기 MB (선택 — 기본 20, 5~25). 한백이 정하면 그 값' },
    },
    required: ['sites', 'doc'],
  },
};

/** 현장 양식 메일 도구 — 그 운영사의 양식(spec)으로만 쓴다 */
function siteMailTool(spec: SiteMailSpec) {
  return {
    name: 'site_mail',
    description: `현장 하나의 「${spec.label}」 초안을 올린다 — 그 현장의 ${spec.doc} 파일을 붙이고 본문은 정해진 양식이다. `
      + '받는 사람은 같은 양식으로 마지막에 보낸 주소로 찬다(처음이면 비어 있어 한백이 카드에서 넣는다). '
      + `${josa(spec.doc, '이', '가')} 아직 없으면 실패하고 그 까닭을 돌려준다 — 그대로 전한다. `
      + '한백이 그 현장의 메일을 (다시) 보내 달라고 할 때 쓴다. 너는 보내지 못한다 — 한백이 승인해야 나간다.',
    input_schema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: '현장의 관리번호, 예: HB-2026-123' },
        ...(spec.kind === HEC_APPROVAL_MAIL ? {
          force: {
            type: 'boolean',
            description: `${josa(spec.doc, '이', '가')} 맞지 않다고 막혔는데 한백이 그 까닭을 듣고도 그대로 쓰라고 했을 때만 true. 스스로 켜지 않는다`,
          },
        } : {}),
      },
      required: ['site'],
    },
  };
}

/** 운영사 단가표 읽기 — 받는 값이 없다(담당의 운영사 하나뿐이다) */
const PRICING_TOOL = {
  name: 'pricing_table',
  description: '이 운영사의 지금 단가표(콘솔 단가 케이스 — 적용 시작 · 건물 · 연수 · 신설/교체 · 수전 · 턴키 = 영업비 + 시공비 + 마진 · '
    + '프로모션 · 충전요금 · 조건)를 읽는다. 새 영업정책 원자료와 견주거나 단가를 물을 때 쓴다. 읽기만 한다 — 단가표를 고치는 것은 한백이다. '
    + '영업비 · 시공비 · 마진은 한백 안의 값이라 운영사에 보내는 메일에 쓰지 않는다.',
  input_schema: { type: 'object', properties: {} },
};

/**
 * 업무 정의의 도구 — 모두가 쥔다(라우트가 손을 이어 줄 때). 한백이 대화에서 시킬 때만 쓴다(한백 2026-11-05 「나랑 대화하다가 내가
 * 업무 정의에 넣어달라는건 바로 넣어줄수 있나?」 — 그전에는 「업무 정의에는 제가 넣을 수 없습니다」라고 답했다).
 */
const DUTY_TOOLS = [
  {
    name: 'save_duty',
    description: '네 업무 정의에 한 줄을 넣거나(id 없이) 고친다(id — [업무 정의]의 id). 한백이 업무 정의에 넣어 달라 · 고쳐 달라고 했을 때만 '
      + '쓴다. 고칠 때는 앞의 내용을 살려 전체를 다시 쓴다. 다음에 부를 때부터 이 정의대로 일한다.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '고칠 줄의 id — 새로 넣으면 비운다' },
        title: { type: 'string', description: '업무 이름 (60자 이내)' },
        body: { type: 'string', description: '정의 — 무엇을, 언제, 어떤 기준으로, 결과는 어떤 모양으로 (4000자 이내, 마크다운 없이)' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'delete_duty',
    description: '네 업무 정의에서 한 줄을 뺀다 — 한백이 빼 달라고 했을 때만.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: '[업무 정의]의 id' } },
      required: ['id'],
    },
  },
];

/**
 * 기억의 도구 — 모두가 쥔다(라우트가 손을 이어 줄 때 · lib/agents/memory · memos). 메모장(장기기억)을 열고 적고, 메모에 없으면 대화
 * 원문 · 지난 파일을 찾는다.
 */
const MEMORY_TOOLS = [
  {
    name: 'open_memo',
    description: '메모를 연다 — 「[메모 …]」 목록의 id. 지시와 관련 있어 보이는데 「[펼친 메모 …]」에 없는 메모를 볼 때 쓴다. 여러 장을 한 번에 연다.',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: '열 메모의 id 들' } },
      required: ['ids'],
    },
  },
  {
    name: 'save_memo',
    description: '메모를 적는다. 한백이 알려 준 사실 · 정한 것 · 바라는 방식 · 고쳐 준 것을 남길 때 쓴다. id 없이 쓰면 새 메모(title 필수), '
      + 'id 와 append 를 주면 그 메모 끝에 body 를 덧붙이고, id 만 주면 그 메모를 body(와 title)로 바꾼다 — 바꾸는 것은 펼쳤거나 연 메모만. '
      + `같은 주제의 메모가 있으면 새로 만들지 않는다. 이름 ${MEMO_MAX.title}자 · 내용 ${MEMO_MAX.body}자까지.`,
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '덧붙이거나 바꿀 메모의 id — 새 메모면 비운다' },
        scope: { type: 'string', enum: ['mine', 'team'], description: '새 메모의 자리 — mine 내 메모(기본) · team 팀 공용(팀원도 알아야 할 때)' },
        title: { type: 'string', description: '제목 = 펼칠 낱말 — 운영사 · 사업자 · 현장 번호 · 사람 · 주제를 「 · 」로' },
        body: { type: 'string', description: '내용 — 짧게, 날짜와 누가 말했는지를 붙여서. 덧붙일 때는 덧붙일 줄만' },
        append: { type: 'boolean', description: 'true 면 그 메모 끝에 body 를 덧붙인다' },
      },
      required: ['body'],
    },
  },
  {
    name: 'delete_memo',
    description: '메모를 지운다. 한백이 지우라고 했거나 다른 메모에 합친 것만 지운다.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: '지울 메모의 id' } },
      required: ['id'],
    },
  },
  {
    name: 'search_history',
    description: '이 대화창의 원문 전부(한백의 지시 · 기록, 네 답, 자동 · 팀원의 말)에서 찾는다 — 최근 것부터 20개까지 전문으로. '
      + '메모에 없는 지난 일이 필요할 때 쓴다. 낱말은 띄어 쓴 것 모두가 들어 있는 말만 찾는다.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '찾을 낱말 — 현장 이름 · 관리번호 · 사람 · 파일 이름 등 (선택)' },
        from: { type: 'string', description: '이날부터 YYYY-MM-DD (선택)' },
        to: { type: 'string', description: '이날까지 YYYY-MM-DD (선택)' },
      },
    },
  },
  {
    name: 'read_file',
    description: '한백이 이 대화창에 넘긴 파일 하나를 다시 연다 — 「… id=…」의 id. 최근 대화에 붙어 있지 않은 지난 파일을 볼 때 쓴다.',
    input_schema: {
      type: 'object',
      properties: { file_id: { type: 'string', description: '넘긴 파일의 id' } },
      required: ['file_id'],
    },
  },
];

/** 팀의 도구 — 모두가 쥔다(라우트가 손을 이어 줄 때). 같은 사업의 팀원끼리만 */
const TEAM_TOOLS = [
  {
    name: 'team_history',
    description: '팀원 한 사람이 한백 · 팀원과 나눈 것(지시 · 기록 · 답 · 자동 · 팀원의 말 전문, 열린 할 일 · 끝낸 할 일, 업무 정의 '
      + '전문)을 깊이 읽는다. [팀 현황]의 한 줄로 모자랄 때 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '팀원의 id — [팀 현황]의 「id=…」' },
        days: { type: 'integer', description: `최근 며칠 (선택 — 기본 ${HISTORY_DAYS}, 최대 90)` },
        query: {
          type: 'string',
          description: '찾을 낱말 (선택) — 주면 날수와 상관없이 그 팀원의 대화 전부에서 낱말이 든 말을 전문으로 찾는다',
        },
      },
      required: ['member'],
    },
  },
  {
    name: 'tell_teammate',
    description: '팀원 한 사람의 대화창에 말을 남긴다 — 그 팀원이 알아야 할 사실 · 한백이 전해 달라고 한 것 · 그 팀원에게 묻거나 맡길 것. '
      + `그 팀원은 다음에 불릴 때 읽는다(지금 답하지 않는다). 한 답에 ${TELLS_PER_TURN}번까지. 같은 말을 두 번 남기지 않는다.`,
    input_schema: {
      type: 'object',
      properties: {
        member: { type: 'string', description: '팀원의 id — [팀 현황]의 「id=…」' },
        message: { type: 'string', description: '남길 말 — 무엇이 언제 왜, 현장은 관리번호로 (4000자 이내, 마크다운 없이)' },
      },
      required: ['member', 'message'],
    },
  },
];

/**
 * 팀장의 도구 — 팀 목표 · 방향을 올리고 고치고 지운다(실무자 모두가 읽는다).
 * 올리는 것은 한백이 정하라고 했거나 합의한 것만 — 실무자 모두의 지시가 되는 글이라서다.
 */
const LEAD_TOOLS = [
  {
    name: 'save_direction',
    description: '팀 목표 · 방향(목표 · OKR · 방향 · 사업 구조)에 한 줄을 올리거나(id 없이) 고친다(id). 그 사업의 실무자 모두가 '
      + '부를 때마다 이것을 읽고 거기에 맞춰 일한다. 한백이 정하라고 했거나 한백과 합의한 것만 올린다.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '고칠 줄의 id — [팀 목표 · 방향]의 id. 새로 올리면 비운다' },
        title: { type: 'string', description: '한 줄 이름 (60자 이내) — 예: 4분기 목표 · 4분기 OKR · 사업 구조' },
        body: { type: 'string', description: '내용 — 목표 · 핵심 결과 · 기한 · 잴 방법 등 (4000자 이내, 마크다운 없이)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'delete_direction',
    description: '팀 목표 · 방향에서 한 줄을 지운다. 한백이 지우라고 했거나 다른 줄로 대신한 것만 지운다.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: '[팀 목표 · 방향]의 id' } },
      required: ['id'],
    },
  },
];

/**
 * 이 담당이 쥐는 도구 — 할 일 · 메일 · 기억은 모두, 양식 메일 · 단가표는 운영사 담당(라우트가 손을 이어 줄 때), 팀의 도구는
 * 모두(라우트가 손을 이어 줄 때), 목표 · 방향과 웹 검색은 전략·기획(목표 · 방향도 라우트가 손을 이어 줄 때)
 */
export function toolsOf(
  agent: Agent,
  hands: Pick<
    AgentHands, 'siteMail' | 'pricingTable' | 'saveDirection' | 'tellTeammate' | 'saveMemo' | 'saveDuty' | 'bundleSiteDocs' | 'agitDraft'
  >,
): unknown[] {
  const siteSpec = agent.kind === 'operator' && hands.siteMail ? siteMailOfCpo(agent.cpo) : null;
  return [
    addTaskTool(agent.biz === 'ev'),
    COMPLETE_TASK_TOOL,
    draftMailTool(Boolean(hands.bundleSiteDocs)),
    ...(hands.bundleSiteDocs ? [BUNDLE_TOOL] : []),
    ...(agent.kind === 'settlement' && hands.agitDraft ? [AGIT_POST_TOOL] : []),
    ...(siteSpec ? [siteMailTool(siteSpec)] : []),
    ...(agent.kind === 'operator' && hands.pricingTable ? [PRICING_TOOL] : []),
    ...(hands.saveDuty ? DUTY_TOOLS : []),
    ...(hands.saveMemo ? MEMORY_TOOLS : []),
    ...(hands.tellTeammate ? TEAM_TOOLS : []),
    ...(isLead(agent.kind) && hands.saveDirection ? LEAD_TOOLS : []),
    ...(agent.kind === 'strategy' ? [WEB_SEARCH] : []),
  ];
}

/*
 * 한 답에 검색 여덟 번까지 — 다섯 번이었을 때 첫 시험(2026-11-02 보조금 정책)에서 「검색이 횟수 제한으로 중간에
 * 끊겼다」고 스스로 적었다. 한 번에 1센트, 그 답은 46초 · $0.20 이었다.
 */
const WEB_SEARCH = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 8,
  user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' },
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** 바퀴마다의 글을 모은다 — 같은 글은 한 번, 앞 글을 품은 새 글은 앞 글 자리에(lib/agents/brain agentReply) */
export function pushSaid(texts: string[], said: string): void {
  const t = said.trim();
  if (!t) return;
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  if (texts.some((x) => flat(x) === flat(t))) return;
  const i = texts.findIndex((x) => flat(t).includes(flat(x)));
  if (i >= 0) texts[i] = t;
  else if (!texts.some((x) => flat(x).includes(flat(t)))) texts.push(t);
}

export interface AgentTurn {
  text: string;
  meta: AgentMessageMeta;
}

/**
 * 한 번 답한다. 실패하면 사람 말로 된 Error 를 던진다(라우트가 422 로 단추 옆에 띄운다) — 지시는 이미 저장돼 있어
 * 「다시 묻기」로 같은 지시에 다시 답하게 할 수 있다.
 */
export async function agentReply(input: {
  agent: Agent;
  duties: AgentDuty[];
  tasks: AgentTask[];
  /** 최근 대화 20~39개(오래된 것부터 — store/agent-memory agentRecent). 그 앞은 메모 · search_history 로 안다 */
  recent: AgentMessage[];
  /** 이 담당이 읽는 메모 — 자기 메모 · 팀 공용(store/agent-memory agentMemos). 제목은 늘, 내용은 펼친 것만 싣는다 */
  memos: AgentMemos;
  brief: string;
  today: string;
  /** 그 사업의 팀 — 팀장 · 실무자 · 팀 목표 · 방향(store/agent-team agentTeam) */
  team: AgentTeam;
  /** 다른 팀원들의 한 줄 현황(lib/agents/team teamBriefOf). 마지막 지시 곁에 붙는다 */
  teamBrief?: string | null;
  hands: AgentHands;
}): Promise<AgentTurn> {
  const { agent, hands } = input;
  /* 바뀌지 않는 것만 — 역할 · 팀 · 일하는 법 · 팀 목표 · 방향 · 업무 정의(한백 · 팀장이 고칠 때만 바뀐다) */
  const system = [
    {
      type: 'text' as const,
      text: `너는 한백의 「${agent.name}」이다. ${companyLineOf(agent)} 너는 이 대화창에서 한백 관리자와 일한다.\n\n`
        + `${roleOf(agent)}\n\n${teamLineOf(agent, input.team)}\n\n${RULES}\n\n`
        + `${directionsBlock(input.team.directions, isLead(agent.kind))}\n\n${dutiesBlock(input.duties)}`,
      /* 도구 · 시스템은 담당마다 늘 같다 — 여기 표지가 있어야 지시가 바뀌어도 이만큼은 캐시에서 읽는다 */
      cache_control: { type: 'ephemeral' as const },
    },
  ];
  const siteSpec = agent.kind === 'operator' && hands.siteMail ? siteMailOfCpo(agent.cpo) : null;
  const tools = toolsOf(agent, hands);
  const { recent } = input;
  if (!awaitsReply(recent)) throw new Error('답할 지시가 없습니다.');
  const said = toMessages(recent, await fileTextsOf(recent));
  if (said.length === 0 || said[said.length - 1].role !== 'user') {
    throw new Error('답할 지시가 없습니다.');
  }
  /* 메모 — 제목은 늘, 이번 말에 제목의 낱말이 나온 것은 펼쳐서(lib/agents/memos). 이 답 동안 열고 고친 것을 여기서 따라간다 */
  const memoOf = new Map<string, AgentMemo>([...input.memos.mine, ...input.memos.team].map((m) => [m.id, m]));
  const opened = memosToOpen([...input.memos.mine, ...input.memos.team], pendingOf(recent));
  const seen = new Set(opened.map((m) => m.id));
  const messages = withContext(
    said,
    `[지금 — 이 지시를 받은 때의 콘솔 자료]\n오늘: ${input.today} (한국)\n\n${tasksBlock(input.tasks)}\n\n${input.brief}`
      + (input.teamBrief ? `\n\n${input.teamBrief}` : '')
      + `\n\n${memoBlock(input.memos, opened)}`,
  );

  const started = Date.now();
  const texts: string[] = [];
  const sources = new Map<string, AgentSource>();
  const added: string[] = [];
  const done: string[] = [];
  const mails: string[] = [];
  const agitDrafts: string[] = [];
  const directions: string[] = [];
  const told: string[] = [];
  const memoed: string[] = [];
  const dutied: string[] = [];
  /* 이 답에서 묶은 현장 서류 — id → zip(draft_mail 이 붙인다) */
  const bundles = new Map<string, BundlePart['zip']>();
  let usd = 0;
  /* 바퀴마다의 토큰을 모은다 — 사용량 표가 캐시가 얼마나 먹었는지 보여 준다(store/agents agentUsage) */
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let searchCount = 0;

  async function runTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const fail = (why: string): Anthropic.ToolResultBlockParam => ({ type: 'tool_result', tool_use_id: block.id, content: why, is_error: true });
    const args = (block.input ?? {}) as Record<string, unknown>;
    try {
      if (block.name === 'add_task') {
        const title = str(args.title);
        if (!title) return fail('title 이 비었다.');
        const due = DAY_RE.test(str(args.due)) ? str(args.due) : null;
        const ref = str(args.site);
        const projectId = ref ? hands.siteOf(ref) : null;
        const id = await hands.addTask({ title, note: str(args.note) || null, due, projectId });
        added.push(title);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `적었다 (id=${id})${ref && !projectId ? ` — 현장 ${ref} 를 찾지 못해 현장 없이 적었다` : ''}`,
        };
      }
      if (block.name === 'complete_task') {
        const id = str(args.task_id);
        if (!id) return fail('task_id 가 비었다.');
        done.push(await hands.completeTask(id));
        return { type: 'tool_result', tool_use_id: block.id, content: '끝냈다' };
      }
      if (block.name === 'bundle_site_docs' && hands.bundleSiteDocs) {
        const sites = Array.isArray(args.sites) ? args.sites.map(str).filter(Boolean) : [];
        const doc = str(args.doc);
        if (sites.length === 0 || !doc) return fail('sites(관리번호들)와 doc(서류 이름)가 있어야 한다.');
        const maxMb = typeof args.max_mb === 'number' && Number.isFinite(args.max_mb) ? args.max_mb : null;
        const b = await hands.bundleSiteDocs({ sites, doc, maxMb });
        for (const part of b.parts) bundles.set(part.id, part.zip);
        return { type: 'tool_result', tool_use_id: block.id, content: bundleText(b) };
      }
      if (block.name === 'draft_mail') {
        if (mails.length >= MAILS_PER_TURN) return fail(`한 답에 메일 초안은 ${MAILS_PER_TURN}통까지다.`);
        const subject = str(args.subject);
        const ids = Array.isArray(args.attach_file_ids) ? args.attach_file_ids.map(str).filter(Boolean) : [];
        let body = str(args.body);
        /* 묶은 현장 서류(bundle_site_docs) — 첨부 묶음은 docFiles 로, 링크 묶음은 본문 끝 줄로(lib/agents/bundle) */
        const idsOf = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
        const attachIds = idsOf(args.attach_bundle_ids);
        const linkIds = idsOf(args.link_bundle_ids);
        const docFiles: Array<{ name: string; url: string; size: number; contentType: string | null }> = [];
        if (attachIds.length || linkIds.length) {
          if (!hands.bundleFile) return fail('이 담당은 현장 서류 묶음을 붙이지 못한다.');
          const zipOf = async (id: string) => bundles.get(id) ?? (await hands.bundleFile!(id));
          for (const bid of attachIds) {
            const z = await zipOf(bid);
            if (!z) return fail(`묶음 id=${bid} 를 찾지 못했다 — bundle_site_docs 가 돌려준 id 를 쓴다.`);
            if (!attachable(z.size, docFiles.reduce((n, f) => n + f.size, 0))) {
              return fail(`묶음 「${z.name}」(${z.size}바이트)까지 붙이면 한 통의 첨부 한도를 넘는다 — 묶음마다 한 통씩 쓰거나 링크로 단다.`);
            }
            docFiles.push(z);
          }
          for (const bid of linkIds) {
            const z = await zipOf(bid);
            if (!z) return fail(`묶음 id=${bid} 를 찾지 못했다 — bundle_site_docs 가 돌려준 id 를 쓴다.`);
            body += bundleLinkLines(z);
          }
        }
        const id = await hands.draftMail({ to: args.to, cc: args.cc, subject, body, fileIds: ids, docFiles });
        mails.push(subject);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `초안을 올렸다 (id=${id}) — 한백이 승인하면 나간다. 아직 보내지 않았다.`
            + (docFiles.length ? ` 붙인 묶음: ${docFiles.map((f) => f.name).join(', ')}.` : '')
            + (linkIds.length ? ` 링크로 단 묶음 ${linkIds.length}개.` : ''),
        };
      }
      if (block.name === 'site_mail' && siteSpec && hands.siteMail) {
        if (mails.length >= MAILS_PER_TURN) return fail(`한 답에 메일 초안은 ${MAILS_PER_TURN}통까지다.`);
        const ref = str(args.site);
        const projectId = ref ? hands.siteOf(ref) : null;
        if (!projectId) return fail(`현장 ${ref || '(비어 있음)'} 를 찾지 못했다 — 관리번호를 확인한다.`);
        const made = await hands.siteMail(projectId, args.force === true);
        mails.push(made.subject);
        const who = made.to.length ? `받는 사람 ${made.to.join(', ')}` : '받는 사람 미지정(한백이 카드에서 넣는다)';
        const checks = made.checks.length ? ` 카드에 「확인 필요」: ${made.checks.join(' / ')} — 한백에게 전한다.` : '';
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: made.plan === 'keep'
            ? `같은 초안이 이미 올라와 있다 (id=${made.id}, ${who}) — 그대로 두었다. 한백이 승인하면 나간다.${checks}`
            : `초안을 올렸다 (id=${made.id}, ${who})${made.plan === 'replace' ? ' — 앞의 보내지 않은 초안은 서류가 달라 버렸다' : ''}. `
              + '아직 보내지 않았다 — 한백이 승인하면 나간다.' + checks,
        };
      }
      if (block.name === 'agit_post' && agent.kind === 'settlement' && hands.agitDraft) {
        const payDate = str(args.pay_date);
        if (!DAY_RE.test(payDate)) return fail('pay_date 는 YYYY-MM-DD 다.');
        if (agitDrafts.length >= 4) return fail('한 답에 아지트 글 초안은 넷까지다.');
        /* 긴급사유 — 칸을 주었으면(빈 글 포함) 그 모양으로, 안 주었으면 지금 초안의 모양 그대로 */
        const urgent = typeof args.urgent_reason === 'string' ? args.urgent_reason : undefined;
        const kind = args.kind === '영업비' || args.kind === '시공비' ? args.kind : undefined;
        const { made, skipped } = await hands.agitDraft({
          payDate, again: args.again === true, ...(urgent !== undefined ? { urgent } : {}), ...(kind ? { kind } : {}),
        });
        const lines = made.map((m) => {
          agitDrafts.push(m.urgent ? `${m.name} (긴급)` : m.name);
          const sum = `지급 ${m.batches}건 · 공급가액 ${m.total.toLocaleString('ko-KR')}원`;
          const shape = m.urgent ? ` · 긴급 글 — 사유 「${m.urgent.replace(/\n/g, ' / ')}」` : ' · 보통 글(구매요청간소화)';
          return m.plan === 'create' ? `${m.kind} 글 초안을 올렸다 (id=${m.id}, ${m.name} · ${sum}${shape})`
            : m.plan === 'refresh' ? `${m.kind} 글의 승인 전 초안을 지금 글로 고쳐 이 답 밑으로 옮겼다 (id=${m.id}, ${sum}${shape})`
              : `${m.kind} 글의 같은 초안이 이미 있어 이 답 밑으로 옮겼다 (id=${m.id}, ${sum}${shape})`;
        });
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: [
            ...lines,
            ...skipped.map((k) => `${k.kind} 글은 짓지 않았다 — ${k.why}`),
            '아직 올리지 않았다. 한백이 Claude Code 에 「올려」라고 하면 그때 금액으로 다시 지어 한백의 계정으로 아지트에 올라간다(구분마다 한 글).',
          ].join('\n'),
        };
      }
      if (block.name === 'pricing_table' && agent.kind === 'operator' && hands.pricingTable) {
        return { type: 'tool_result', tool_use_id: block.id, content: await hands.pricingTable() };
      }
      if (block.name === 'save_direction' && isLead(agent.kind) && hands.saveDirection) {
        const title = str(args.title);
        if (!title) return fail('title 이 비었다.');
        const id = str(args.id) || null;
        const saved = await hands.saveDirection({ id, title, body: str(args.body) });
        directions.push(saved.title);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `${id ? '고쳤다' : '올렸다'} (id=${saved.id}) — 실무자 모두가 다음에 부를 때부터 읽는다.`,
        };
      }
      if (block.name === 'delete_direction' && isLead(agent.kind) && hands.deleteDirection) {
        const id = str(args.id);
        if (!id) return fail('id 가 비었다.');
        directions.push(await hands.deleteDirection(id));
        return { type: 'tool_result', tool_use_id: block.id, content: '지웠다 — 실무자들은 다음에 부를 때부터 읽지 않는다.' };
      }
      if (block.name === 'save_duty' && hands.saveDuty) {
        const title = str(args.title);
        if (!title) return fail('title 이 비었다.');
        const id = str(args.id) || null;
        if (id && !input.duties.some((d) => d.id === id)) return fail(`id=${id} 업무 정의가 없다 — [업무 정의]의 id 를 쓴다.`);
        const saved = await hands.saveDuty({ id, title, body: typeof args.body === 'string' ? args.body.trim() : '' });
        dutied.push(title);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `${id ? '고쳤다' : '넣었다'} (id=${saved}) — 다음에 부를 때부터 이 정의대로 일한다. 화면의 업무 정의에도 보인다.`,
        };
      }
      if (block.name === 'delete_duty' && hands.deleteDuty) {
        const id = str(args.id);
        if (!id) return fail('id 가 비었다.');
        dutied.push(await hands.deleteDuty(id));
        return { type: 'tool_result', tool_use_id: block.id, content: '뺐다 — 다음에 부를 때부터 읽지 않는다.' };
      }
      if (block.name === 'open_memo') {
        const ids = Array.isArray(args.ids) ? args.ids.map(str).filter(Boolean) : [str(args.ids)].filter(Boolean);
        if (ids.length === 0) return fail('ids 가 비었다.');
        const found = ids.map((id) => memoOf.get(id)).filter((m): m is AgentMemo => Boolean(m));
        for (const m of found) seen.add(m.id);
        const missing = ids.filter((id) => !memoOf.has(id));
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: [...found.map(memoText), ...(missing.length ? [`없는 메모: ${missing.join(', ')}`] : [])].join('\n\n'),
        };
      }
      if (block.name === 'save_memo' && hands.saveMemo) {
        if (memoed.length >= MEMOS_PER_TURN) return fail(`한 답에 메모는 ${MEMOS_PER_TURN}번까지 적는다.`);
        const id = str(args.id) || null;
        const body = typeof args.body === 'string' ? args.body.trim() : '';
        const title = str(args.title) || undefined;
        const append = args.append === true;
        const old = id ? memoOf.get(id) : undefined;
        if (id && !old) return fail(`id=${id} 메모가 없다 — 「[메모 …]」의 id 를 쓴다.`);
        /* 통째로 바꾸는 것은 내용을 본 메모만 — 안 보고 바꾸면 앞의 내용이 사라진다 */
        if (old && !append && !seen.has(old.id)) return fail('바꾸기 전에 open_memo 로 읽는다 — 덧붙이기만이면 append 를 true 로.');
        if (!old && !title) return fail('새 메모에는 title 이 필요하다.');
        const scope: MemoScope = old?.scope ?? (args.scope === 'team' ? 'team' : 'mine');
        const saved = await hands.saveMemo({ scope, id, title, body, append });
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
        memoOf.set(saved.id, {
          id: saved.id, scope, title: saved.title,
          body: old ? (append ? [old.body.trim(), body].filter(Boolean).join('\n') : body) : body,
          author: agent.name, byAgent: true, updatedAt: old ? now : null, createdAt: old?.createdAt ?? now,
        });
        seen.add(saved.id);
        memoed.push(saved.title);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `${old ? (append ? '덧붙였다' : '고쳤다') : '적었다'} (id=${saved.id} · ${scope === 'team' ? '팀 공용' : '내 메모'})`,
        };
      }
      if (block.name === 'delete_memo' && hands.deleteMemo) {
        const old = memoOf.get(str(args.id));
        if (!old) return fail(`id=${str(args.id) || '(비어 있음)'} 메모가 없다.`);
        memoed.push(await hands.deleteMemo({ scope: old.scope, id: old.id }));
        memoOf.delete(old.id);
        return { type: 'tool_result', tool_use_id: block.id, content: '지웠다.' };
      }
      if (block.name === 'search_history' && hands.searchHistory) {
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: await hands.searchHistory({ query: str(args.query), from: str(args.from), to: str(args.to) }),
        };
      }
      if (block.name === 'read_file' && hands.readFile) {
        const f = await hands.readFile(str(args.file_id));
        if (!f) return fail(`이 대화창에 넘긴 파일 중 id=${str(args.file_id) || '(비어 있음)'} 가 없다.`);
        const read = agentFileRead(f.name);
        /* PDF · 그림은 대화에 붙일 때와 같은 덩이로 돌려준다(도구 결과에도 문서 · 그림 덩이가 든다 — SDK 0.52 타입은 그림까지만 안다) */
        if (read === 'pdf' || read === 'image') {
          return { type: 'tool_result', tool_use_id: block.id, content: fileBlocks(f) as Anthropic.ToolResultBlockParam['content'] };
        }
        const t = await fileText(f);
        const head = `[넘긴 파일 ${f.name} · id=${f.id}]`;
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: t ? `${head} — 글자만 뽑음\n${t}` : `${head} — 이 형식은 열지 못한다. 이름만 안다`,
        };
      }
      if (block.name === 'team_history' && hands.teamHistory) {
        const member = str(args.member);
        if (!member) return fail('member 가 비었다.');
        const days = typeof args.days === 'number' && Number.isFinite(args.days) ? args.days : HISTORY_DAYS;
        const query = str(args.query) || undefined;
        return { type: 'tool_result', tool_use_id: block.id, content: await hands.teamHistory(member, days, query) };
      }
      if (block.name === 'tell_teammate' && hands.tellTeammate) {
        if (told.length >= TELLS_PER_TURN) return fail(`한 답에 팀원에게 남기는 말은 ${TELLS_PER_TURN}번까지다.`);
        const member = str(args.member);
        const body = str(args.message);
        if (!member) return fail('member 가 비었다.');
        if (!body) return fail('message 가 비었다.');
        const name = await hands.tellTeammate(member, body);
        told.push(name);
        return {
          type: 'tool_result', tool_use_id: block.id,
          content: `${name}의 대화창에 남겼다 — 다음에 불릴 때 읽는다(지금 답하지 않는다).`,
        };
      }
      return fail(`모르는 도구: ${block.name}`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0 && Date.now() - started > ROUND_BUDGET_MS) break;
    const params: CreateParams = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      fallbacks: 'default',
    };
    const at = Date.now();
    let res: Anthropic.Message;
    try {
      res = await clientOf(agent).messages.create(params as Anthropic.MessageCreateParamsNonStreaming, {
        timeout: CALL_TIMEOUT_MS, maxRetries: 1, headers: { 'anthropic-beta': FALLBACK_BETA },
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error('[agent]', agent.id, err.status, err.message);
        if (err.status === 400 && /pdf|document|image|url|fetch|download/i.test(err.message)) {
          throw new Error('넘긴 파일을 AI 가 열지 못했습니다(너무 크거나 쪽수가 많을 수 있습니다) — 나눠서 다시 넘겨 주세요.');
        }
        throw new Error(err.status === 429 || err.status === 529
          ? 'AI 가 지금 붐빕니다 — 잠시 뒤 「다시 묻기」를 눌러 주세요.'
          : `답을 받지 못했습니다(${err.status ?? '연결'}) — 「다시 묻기」를 눌러 주세요.`);
      }
      throw err;
    }
    logLlmCall({ route: `agent:${agent.id}`, model: MODEL, ms: Date.now() - at, usage: res.usage });
    const searches = (res.usage as { server_tool_use?: { web_search_requests?: number } } | undefined)
      ?.server_tool_use?.web_search_requests ?? 0;
    usd += usdOf(MODEL, res.usage) + searches * SEARCH_USD;
    tokens.input += res.usage?.input_tokens ?? 0;
    tokens.output += res.usage?.output_tokens ?? 0;
    tokens.cacheRead += res.usage?.cache_read_input_tokens ?? 0;
    tokens.cacheWrite += res.usage?.cache_creation_input_tokens ?? 0;
    searchCount += searches;

    /* 인용이 붙은 글은 조각으로 온다 — 한 응답의 글 조각은 이어 붙이고, 바퀴 사이는 한 줄 띄운다 */
    let said = '';
    for (const block of res.content) {
      if (block.type !== 'text') continue;
      said += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === 'web_search_result_location' && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title });
      }
    }
    /*
     * 도구를 부르며 답을 먼저 써 두고, 도구 결과를 받은 뒤 같은 답을 다시 쓰는 일이 있다(2026-11-05 실측 — 할 일을 적으며 같은 두 문단이
     * 두 번 나갔다). 앞 바퀴의 글과 같으면 버리고, 앞 글을 품은 새 글이면 갈아 끼운다
     */
    pushSaid(texts, said);

    if (res.stop_reason === 'refusal') {
      throw new Error('에이전트가 이 지시에 답하지 않았습니다 — 말을 바꿔 다시 물어 주세요.');
    }
    if (res.stop_reason === 'tool_use') {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === 'tool_use') results.push(await runTool(block));
      }
      /*
       * 도구 차례라면서 도구 덩이가 없는 응답이 왔다(2026-11-05 운영 — 다음 바퀴가 「messages.22: user messages must have non-empty
       * content」 400 으로 죽어 「다시 묻기」만 남았다). 빈 결과를 보내지 않고 받은 글로 끝낸다 — 무엇이 왔는지는 로그에 남긴다
       */
      if (results.length === 0) {
        console.error('[agent]', agent.id, '도구 차례인데 도구 덩이 없음', res.content.map((b) => b.type).join(','));
        break;
      }
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });
      messages.push({ role: 'user', content: results });
      continue;
    }
    if (res.stop_reason === 'pause_turn') {
      // 서버 쪽 웹 검색이 멈춘 자리 — 응답을 그대로 붙여 보내면 서버가 이어 간다(「계속」을 덧붙이지 않는다)
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });
      continue;
    }
    break;
  }

  const text = texts.join('\n\n').trim();
  const acted = {
    ...(added.length ? { added } : {}),
    ...(done.length ? { done } : {}),
    ...(mails.length ? { mails } : {}),
    ...(agitDrafts.length ? { agit: agitDrafts } : {}),
    ...(directions.length ? { directions } : {}),
    ...(told.length ? { told } : {}),
    ...(memoed.length ? { memos: memoed } : {}),
    ...(dutied.length ? { duties: dutied } : {}),
    tokens,
    ...(searchCount ? { searches: searchCount } : {}),
  };
  if (!text) {
    // 할 일 · 메일 초안은 이미 남았을 수 있다 — 그 사실은 남긴다
    if (added.length || done.length || mails.length || agitDrafts.length || directions.length || told.length || memoed.length || dutied.length) {
      return {
        text: [
          added.length ? `할 일을 적었습니다: ${added.join(' · ')}` : '',
          done.length ? `끝냈습니다: ${done.join(' · ')}` : '',
          mails.length ? `메일 초안을 올렸습니다: ${mails.join(' · ')}` : '',
          agitDrafts.length ? `아지트 글 초안을 올렸습니다: ${agitDrafts.join(' · ')}` : '',
          directions.length ? `목표 · 방향을 고쳤습니다: ${directions.join(' · ')}` : '',
          told.length ? `팀원에게 남겼습니다: ${told.join(' · ')}` : '',
          memoed.length ? `메모를 적었습니다: ${memoed.join(' · ')}` : '',
          dutied.length ? `업무 정의를 고쳤습니다: ${dutied.join(' · ')}` : '',
        ].filter(Boolean).join('\n'),
        meta: { model: MODEL, ms: Date.now() - started, usd, ...acted },
      };
    }
    throw new Error('답을 끝내지 못했습니다 — 「다시 묻기」를 눌러 주세요.');
  }
  return {
    text,
    meta: {
      model: MODEL,
      ms: Date.now() - started,
      usd,
      ...(sources.size ? { sources: [...sources.values()] } : {}),
      ...acted,
    },
  };
}
