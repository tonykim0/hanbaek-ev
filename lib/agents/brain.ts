/**
 * 에이전트가 답한다 (서버 전용) — 업무 정의 · 열린 할 일 · 지금 콘솔 자료 · 지난 대화를 읽고 한백의 지시에 답한다.
 *
 * ★손에 쥔 것은 할 일 목록뿐이다★ — add_task · complete_task 두 도구. 반려 · 확정 · 단계 이동 · 지급 같은 콘솔의 값은
 * 못 바꾼다(그건 사람이 콘솔에서 누른다 — 판독이 반려하지 않는 것과 같은 원칙). 전략·기획만 웹 검색을 더 쥔다.
 *
 * 한백이 넘긴 파일(lib/agents/files)은 그 말에 붙여 읽는다 — PDF · 그림은 주소로 바로, 엑셀 · 워드 · 한글(hwpx) · 글 파일은
 * 서버가 글자를 뽑아서(lib/agents/file-text), 그 밖의 형식은 이름만.
 *
 * ★바뀌는 자료는 마지막 지시 곁에 둔다★ — 시스템에는 바뀌지 않는 것(역할 · 일하는 법 · 업무 정의)만 두고, 그때그때 바뀌는
 * 오늘 · 열린 할 일 · 콘솔 자료는 마지막 지시에 붙인다. 그래야 지난 대화(넘긴 PDF 포함)가 캐시에서 싸게 읽힌다 — 바뀌는
 * 자료가 앞에 있으면 그 뒤의 대화 전부를 매번 새로 읽는다.
 *
 * 모델은 claude-opus-5-5 다 — 생각을 끌 수 없고(adaptive 가 늘 돈다) 강도는 effort 가 정한다. 설치된 SDK(0.52)가
 * output_config · 새 웹 검색 · 서버 대체(fallbacks)의 타입을 모르므로 요청 타입을 넓혀 보낸다(lib/survey/read-plate 와 같은 방식).
 * 거절(refusal)은 서버가 다른 모델로 이어 답하게 한다(fallbacks: "default").
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall, usdOf } from '@/lib/llm-usage';
import { agentFileRead } from './files';
import { fileTextsOf } from './file-text';
import type { Agent, AgentDuty, AgentFile, AgentMessage, AgentMessageMeta, AgentSource, AgentTask } from '@/types/agents';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-5-5';
/** 생각도 max_tokens 에 든다 — 아지트 글 초안처럼 긴 답이 잘리지 않게 넉넉히 */
const MAX_TOKENS = 16000;
/** 한 번 부르는 시간 — 라우트는 300초에 끊긴다(maxDuration) */
const CALL_TIMEOUT_MS = 110_000;
/** 도구를 쓰고 다시 부르는 것 · 웹 검색이 멈췄다 잇는 것까지 합친 상한 */
const MAX_ROUNDS = 6;
/** 이 시간이 지나면 다음 바퀴를 돌지 않는다 — 라우트가 끊기기 전에 받은 데까지 남긴다 */
const ROUND_BUDGET_MS = 170_000;
/** 에이전트가 읽는 지난 대화 — 최근 것부터 */
export const HISTORY_TURNS = 40;
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
  switch (agent.kind) {
    case 'operator':
      return `${agent.cpo} 운영사와 관련된 일을 맡는다. ${agent.cpo} 현장들이 접수부터 준공까지 막히지 않고 흘러가게 챙기고, `
        + `${agent.cpo} 쪽과 오간 일을 기록한다. [현장] 자료의 「칸」은 그 현장이 선 단계, 「차례」는 지금 움직여야 할 쪽 `
        + '(한백 · 영업사 · 시공사), 「정체」는 마지막 진척 뒤 지난 날수다.';
    case 'settlement':
      return '정산을 맡는다 — 세 가지다.\n'
        + '1) 기성관리: 한백이 운영사에게서 받을 돈(기성)을 챙긴다. [기성관리] 자료가 청구 · 수금할 차례다.\n'
        + '2) 지급관리: 협력사(영업사 · 시공사)에게 줄 영업비 · 시공비. 지급은 배치(지급처 × 구분 × 지급일)로 묶여 가확정 → 확정 → '
        + '지급완료로 간다. 가확정이면 협력사가 세금계산서를 발행할 차례이고, 확정 누락은 지급일이 지났는데 확정을 건너뛴 것이다.\n'
        + '3) 열린구매: 지급을 위해 한백 사내 아지트에 올릴 지출 글을 쓰고 붙일 자료를 챙긴다. [열린구매] 자료가 재료다. 글의 양식과 '
        + '꼭 들어갈 항목은 업무 정의를 따른다. 업무 정의에 양식이 없으면 제목 · 지출 내용 · 지급처 · 금액 · 지급일 · 계좌 · 붙일 자료 '
        + '순으로 쓰고, 양식을 정해 달라고 한 줄 덧붙인다. 금액은 자료의 공급가액 그대로 쓰고, 부가세를 더할지는 업무 정의를 따른다. '
        + '붙일 자료는 자료 줄에 있는 것(거래명세서 주소 · 세금계산서 · 사업자등록증 · 통장사본)을 적고, 없는 것은 없다고 짚는다. '
        + '아지트에 올리는 것은 아직 네가 하지 못한다 — 글을 다 쓰면 한백이 올린다.';
    case 'strategy':
      return '시장 정보를 모으고 전략·기획을 맡는다. 전기차 충전 인프라 시장(환경부 보조금 정책 · 운영사 동향 · 공동주택 충전기 '
        + '설치 의무 · 경쟁 시공사)을 웹 검색으로 찾아보고, [수주 흐름]과 견주어 한백에 필요한 것을 정리한다. '
        + '찾아본 사실에는 출처를 밝히고, 추측과 사실을 가른다.';
  }
}

const RULES = `일하는 법:
- 한국어로, 짧고 구체적으로 답한다. 현장은 관리번호와 이름으로 짚는다.
- 숫자와 사실은 자료와 대화에 있는 것만 쓴다. 자료에 없으면 없다고 말하고 지어내지 않는다.
- 표 · 굵은 글씨 · 제목(#) 같은 마크다운은 쓰지 않는다. 줄바꿈과 「- 」 목록만 쓴다 — 화면이 글자를 그대로 보여준다.
- 너는 콘솔의 값을 바꾸지 못한다. 반려 · 확정 · 단계 이동 · 지급은 사람이 콘솔에서 한다. 필요하면 무엇을 누가 해야 하는지 말한다.
- 한백이 맡긴 일 · 다시 확인할 일 · 기한이 있는 일은 add_task 로 할 일에 적는다. 같은 할 일이 이미 열려 있으면 또 적지 않는다.
  한백이 끝났다고 알려 준 할 일은 complete_task 로 끝낸다. 적거나 끝냈으면 답에 한 줄로 말한다.
- 「[기록 …]」으로 시작하는 말은 한백이 남긴 기록이다(운영사 담당자와 통화한 내용 같은 것). 답을 바라는 말이 아니지만 근거로 쓴다.
- 「[넘긴 파일 …]」은 한백이 너에게 준 파일이다. 읽을 수 있으면 읽고 근거로 쓴다. 이름만 알고 열지 못한 파일은 그렇다고 말한다.
- 「[지금 …]」으로 시작하는 덩이는 마지막 지시를 받은 때의 콘솔 자료다 — 한백이 쓴 말이 아니다.`;

function dutiesBlock(duties: AgentDuty[]): string {
  if (duties.length === 0) {
    return '[업무 정의]\n아직 한백이 정한 업무 정의가 없다. 위 역할대로 일하고, 업무 정의를 적어 달라고 한 번 말한다.';
  }
  return [
    '[업무 정의 — 한백이 정한 것. 이것이 너의 일이다]',
    ...duties.map((d, i) => `${i + 1}. ${d.title}${d.body.trim() ? `\n${d.body.trim()}` : ''}`),
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

/** 넘긴 파일 하나를 읽을 덩이로 — PDF · 그림은 주소로, 글자를 뽑은 것은 글로, 그 밖은 이름만 */
function fileBlocks(f: AgentFile, texts?: Map<string, string>): Anthropic.ContentBlockParam[] {
  const head = `[넘긴 파일 ${f.name}]`;
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

/** 마지막 지시 앞에 지금의 자료를 붙인다 — 바뀌는 것이 대화의 끝에 있어야 앞의 대화가 캐시에 남는다 */
export function withContext(messages: Anthropic.MessageParam[], context: string): Anthropic.MessageParam[] {
  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] = typeof last.content === 'string'
    ? [{ type: 'text', text: last.content }]
    : last.content;
  return [...messages.slice(0, -1), { role: last.role, content: [{ type: 'text', text: context }, ...blocks] }];
}

/** 에이전트가 쥔 손 — 라우트가 저장소에 이어 준다(이 파일은 저장소를 모른다) */
export interface AgentHands {
  addTask(input: { title: string; note: string | null; due: string | null; projectId: string | null }): Promise<string>;
  completeTask(id: string): Promise<string>;
  /** 관리번호(또는 현장 id) → 현장 id. 모르면 null */
  siteOf(ref: string): string | null;
}

const TASK_TOOLS = [
  {
    name: 'add_task',
    description: '이 담당의 할 일 목록에 한 줄을 적는다. 한백이 맡긴 일 · 다음에 다시 확인할 일 · 기한이 있는 일을 남길 때 쓴다. '
      + '이미 열린 같은 할 일이 있으면 쓰지 않는다.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '할 일 한 줄 — 무엇을 할지 (120자 이내)' },
        note: { type: 'string', description: '덧붙일 말 — 근거 · 연락처 등 (선택)' },
        due: { type: 'string', description: '기한 YYYY-MM-DD (선택)' },
        site: { type: 'string', description: '관련 현장의 관리번호, 예: HB-2026-123 (선택)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: '열린 할 일을 끝냈다고 표시한다. 한백이 끝났다고 알려 준 할 일만 끝낸다.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string', description: '[열린 할 일]의 id' } },
      required: ['task_id'],
    },
  },
];

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
  history: AgentMessage[];
  brief: string;
  today: string;
  hands: AgentHands;
}): Promise<AgentTurn> {
  const { agent, hands } = input;
  /* 바뀌지 않는 것만 — 역할 · 일하는 법 · 업무 정의(한백이 고칠 때만 바뀐다) */
  const system = [
    {
      type: 'text' as const,
      text: `너는 한백의 「${agent.name}」이다. 한백은 전기차 충전기 설치 사업을 한다 — 운영사(충전사업자)와 계약해 아파트 등에 `
        + '충전기를 놓고, 영업사 · 시공사 협력사에게 하도급을 준다. 너는 이 대화창에서 한백 관리자와 일한다.\n\n'
        + `${roleOf(agent)}\n\n${RULES}\n\n${dutiesBlock(input.duties)}`,
    },
  ];
  const tools: unknown[] = agent.kind === 'strategy' ? [...TASK_TOOLS, WEB_SEARCH] : [...TASK_TOOLS];
  const said = toMessages(input.history, await fileTextsOf(input.history));
  if (said.length === 0 || said[said.length - 1].role !== 'user') {
    throw new Error('답할 지시가 없습니다.');
  }
  const messages = withContext(
    said,
    `[지금 — 이 지시를 받은 때의 콘솔 자료]\n오늘: ${input.today} (한국)\n\n${tasksBlock(input.tasks)}\n\n${input.brief}`,
  );

  const started = Date.now();
  const texts: string[] = [];
  const sources = new Map<string, AgentSource>();
  const added: string[] = [];
  const done: string[] = [];
  let usd = 0;

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
      res = await anthropic.messages.create(params as Anthropic.MessageCreateParamsNonStreaming, {
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

    /* 인용이 붙은 글은 조각으로 온다 — 한 응답의 글 조각은 이어 붙이고, 바퀴 사이는 한 줄 띄운다 */
    let said = '';
    for (const block of res.content) {
      if (block.type !== 'text') continue;
      said += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === 'web_search_result_location' && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title });
      }
    }
    if (said.trim()) texts.push(said.trim());

    if (res.stop_reason === 'refusal') {
      throw new Error('에이전트가 이 지시에 답하지 않았습니다 — 말을 바꿔 다시 물어 주세요.');
    }
    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content as unknown as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === 'tool_use') results.push(await runTool(block));
      }
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
  if (!text) {
    // 할 일은 이미 적혔을 수 있다 — 그 사실은 남긴다
    if (added.length || done.length) {
      return {
        text: [added.length ? `할 일을 적었습니다: ${added.join(' · ')}` : '', done.length ? `끝냈습니다: ${done.join(' · ')}` : '']
          .filter(Boolean).join('\n'),
        meta: { model: MODEL, ms: Date.now() - started, usd, added, done },
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
      ...(added.length ? { added } : {}),
      ...(done.length ? { done } : {}),
    },
  };
}
