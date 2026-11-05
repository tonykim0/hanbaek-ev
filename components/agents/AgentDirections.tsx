/**
 * 팀 목표 · 방향 — 팀장(전략·기획 담당)이 세운 목표 · OKR · 방향 · 사업 구조(migrations/0120, 한백 2026-11-04 「전략및기획에서
 * 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이 알아야하는」). 그 사업의 실무자 모두가 부를 때마다 읽는다.
 *
 * 팀 화면과 팀장 화면에서 고친다 — 한백이 적거나 팀장이 대화 중에 올린다(적은 쪽에 반짝이). 실무자 화면에서는 읽기만이다(readOnly)
 * — 그 실무자가 지금 무엇에 맞춰 일하는지 보는 자리고, 머리 곁의 고리가 팀장 화면으로 간다.
 */
import Link from 'next/link';
import type { AgentDirection } from '@/types/agents';
import { LINK } from './kit';
import { TitledList } from './TitledList';

export function AgentDirections({ leadId, directions, leadLink, clamp = false }: {
  /** 팀장(전략·기획 담당)의 id — 목표 · 방향은 팀장의 것이다 */
  leadId: string;
  directions: AgentDirection[];
  /** 실무자 화면 — 읽기만 하고 머리 곁에 팀장 화면으로 가는 고리를 단다 */
  leadLink?: { href: string; name: string };
  /** 내용을 세 줄까지만, 넘치면 「펼치기」 — 팀 화면 · 담당 화면 */
  clamp?: boolean;
}) {
  return (
    <TitledList
      heading="목표 · 방향"
      meta={leadLink
        ? <>{directions.length}건 · <Link href={leadLink.href} className={LINK}>팀장 {leadLink.name}</Link></>
        : undefined}
      items={directions}
      url={`/api/agents/${leadId}/directions`}
      placeholder={{ title: '이름 — 예: 4분기 목표 · OKR · 사업 구조', body: '내용 — 목표 · 핵심 결과 · 기한 · 잴 방법' }}
      readOnly={Boolean(leadLink)}
      clamp={clamp}
    />
  );
}
