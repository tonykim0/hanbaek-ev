/**
 * 사용량 — 이번 달 · 지난달 담당별 답 수와 비용, 이번 달 토큰 (한백 2026-11-03 「지금 Agent들은 모델 뭐쓰고있어? 사용량 추적도 해야할듯」).
 *
 * 셈은 저장소가 한다(store/agents agentUsage — 답마다 남긴 meta 를 달로 묶는다). 비용은 토큰 × 단가표(lib/llm-usage)의 어림이라
 * 머리에 「어림」을 단다 — 청구액의 정본은 Anthropic 콘솔이다. 토큰 줄은 캐시가 얼마나 먹었는지 보는 자리다: 같은 담당과 이어
 * 말할수록 앞의 대화가 캐시에서 읽혀(입력 값의 5%) 싸진다. 토큰은 2026-11-03 부터 적어서 그 뒤의 답만 센다(줄에 답 수를 적는다).
 * 표의 칸은 화면 규칙 13 그대로다(담당 왼쪽 · 금액 오른쪽 · 건수 가운데).
 */
import type { AgentUsage as Usage } from '@/types/agents';
import { PANEL, TEXT, Td, Th } from '@/components/ui';
import { AgentHead } from './kit';

const MODEL_NAME = 'Claude Opus 5.5';

const dollars = (n: number) => `$${n.toFixed(2)}`;
/** 토큰 수를 짧게 — 1,234 → 1.2천, 1,234,567 → 123만 */
function count(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return `${Math.round(n)}`;
}

export function AgentUsage({ usage }: { usage: Usage }) {
  const sum = usage.byAgent.reduce(
    (a, r) => ({ replies: a.replies + r.replies, usd: a.usd + r.usd, prevReplies: a.prevReplies + r.prevReplies, prevUsd: a.prevUsd + r.prevUsd }),
    { replies: 0, usd: 0, prevReplies: 0, prevUsd: 0 },
  );
  const t = usage.tokens;
  const read = t.input + t.cacheRead + t.cacheWrite;
  const cached = read > 0 ? Math.round((t.cacheRead / read) * 100) : null;

  return (
    <section className={`${PANEL} mt-6 p-5`}>
      <AgentHead meta={`${MODEL_NAME} · 비용은 토큰으로 셈한 어림`}>사용량</AgentHead>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-base">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <Th left>담당</Th>
              <Th>{usage.month} 답</Th>
              <Th money>{usage.month} 비용</Th>
              <Th money>답 하나당</Th>
              <Th>{usage.prevMonth} 답</Th>
              <Th money>{usage.prevMonth} 비용</Th>
            </tr>
          </thead>
          <tbody>
            {usage.byAgent.map((r, i) => (
              <tr key={r.agentId} className={i === 0 ? '' : 'border-t border-slate-100'}>
                <Td left className="font-semibold text-slate-900">{r.name}</Td>
                <Td num>{r.replies}</Td>
                <Td money className="font-bold text-slate-900">{dollars(r.usd)}</Td>
                <Td money className="text-slate-600">{r.replies ? dollars(r.usd / r.replies) : '—'}</Td>
                <Td num className="text-slate-600">{r.prevReplies}</Td>
                <Td money className="text-slate-600">{dollars(r.prevUsd)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr>
              <Td left className="font-black text-slate-900">합계</Td>
              <Td num className="font-bold">{sum.replies}</Td>
              <Td money className="font-black text-slate-900">{dollars(sum.usd)}</Td>
              <Td money className="text-slate-600">{sum.replies ? dollars(sum.usd / sum.replies) : '—'}</Td>
              <Td num className="font-bold text-slate-600">{sum.prevReplies}</Td>
              <Td money className="font-bold text-slate-600">{dollars(sum.prevUsd)}</Td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={`mt-3 ${TEXT.meta} tabular-nums`}>
        {usage.month} 토큰(답 {t.replies}건) — 입력 {count(t.input)} · 캐시 읽기 {count(t.cacheRead)}
        {cached === null ? '' : `(입력의 ${cached}%)`} · 캐시 쓰기 {count(t.cacheWrite)} · 출력 {count(t.output)} · 웹 검색 {t.searches}번
      </p>
    </section>
  );
}
