'use client';

/**
 * 현장 보드 — 어떤 현장이 어느 단계에 있는가.
 *
 * 목록이 아니라 칸이다. 138건이 되면 「어느 단계가 막혀 있나」는 표를 훑어서는 안 보이고
 * 칸 높이로 한눈에 보인다.
 *
 * 옮기는 일 자체(요청·임시 위치·실패 처리)는 껍데기 ProjectsView 가 쥔다. 표에서도 같은
 * 동작을 쓰기 때문이다 — 두 벌로 두면 한쪽만 고쳐지는 일이 생긴다.
 *
 * 끌어 옮기지 않는다 — 스치는 끌기에 단계가 바뀐다(한백 확인). 대신 카드가 다음 걸음을
 * 민다: 조건이 차면 카드에 「다음 단계로 넘기기」가 뜨고, 안 찼으면 막는 것이 적힌다.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ProcessStatus, ProjectSummary } from '@/types/project';
import { PROCESS_STATUSES } from '@/types/project';
import { BOARD_COLUMNS, boardColumnOf, isMyCourt, partnerWaitingOf, waitingSinceOf, type BoardColumn } from '@/lib/board';
import type { Role } from '@/lib/roles';
import { prevStatusOf, statusIndex } from '@/lib/process';
import { Btn, Tag } from '@/components/ui';
import { StopControl } from '@/components/project/StopControl';

export default function ProjectBoard({
  projects, band, canMove, onMove, busyId, role,
}: {
  /** 이미 걸러진 목록. 임시 위치도 반영돼 있다. */
  projects: ProjectSummary[];
  /**
   * 이 보드가 그리는 국면 — 계약 또는 시공.
   * 두 띠를 한 화면에 접어 넣던 때는 줄마다 높이가 반쪽이었다. 페이지를 국면별로
   * 나눴으므로(사이드바 계약/시공) 한 띠가 화면 전부를 쓴다 — 시공 단계를 더
   * 쪼개도 칸이 들어갈 자리가 생긴다.
   */
  band: '계약' | '시공';
  /** 다음 단계로 넘길 수 있는가 (한백만) — 카드의 넘기기 단추가 이것으로 갈린다 */
  canMove: boolean;
  /** 보는 사람의 구분 — 어느 칸이 「내 차례」인지 가르는 데만 쓴다(lib/board isMyCourt) */
  role: Role;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  busyId: string | null;
}) {
  const columns = useMemo(() => {
    const byKey = new Map<BoardColumn, ProjectSummary[]>();
    for (const p of projects) {
      const key = boardColumnOf(p);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(p);
      else byKey.set(key, [p]);
    }
    // 칸 안은 오래 멈춘 순 — 축은 아니지만 어느 것부터 볼지는 알려준다
    for (const list of byKey.values()) list.sort((a, b) => b.stalledDays - a.stalledDays);
    return byKey;
  }, [projects]);

  /* 멈춤 칸은 계약중단 하나다 — 「보류」를 걷었다(한백 2026-08-31). 늘 세운다 */
  const visible = BOARD_COLUMNS;

  /*
   * 띠마다 줄을 바꾼다.
   *
   * 열한 칸을 한 줄로 늘어놓으면 창보다 넓어서 뒤쪽 칸이 화면 밖에 있다.
   * 「어떤 현장이 어느 단계인가」를 답할 화면인데 단계 절반이 안 보이면 답을 못 한다.
   * 줄로 끊고 그 줄 안에서 칸이 폭을 나눠 채운다(아래 gridTemplateColumns).
   *
   * 칸 안쪽은 따로 스크롤한다. 한 칸에 60건이 쌓여도 그 칸만 길어지고 아래 줄은
   * 제자리에 있어야 한다 — 안 그러면 계약 칸이 부풀어 시공 줄을 화면 밖으로 밀어낸다.
   */
  // 들어온 페이지가 상세의 첫 탭을 정한다 — 계약 페이지에서 왔으면 계약 탭, 시공이면 시공 탭
  const tab = band === '계약' ? 'intake' : 'construction';

  /*
   * 멈춤 칸(계약중단)은 따로 줄을 만들지 않고 같은 줄 맨 오른쪽에 붙는다(한백 확인) —
   * 몇 건 안 되는 멈춤이 별도 줄로 계약·시공과 같은 자리를 차지했다.
   * 늘 맨 끝에 선다 — 카드가 갈 곳이 보여야 보낼 수 있다.
   */
  /*
   * 맞물리는 칸(운영사 계약서 제출)은 양쪽 보드에 선다 — 계약의 끝이자 시공의 시작이라
   * 한쪽에만 두면 다른 쪽에서 현장이 통째로 사라진다(한백 지시 2026-08-29).
   * PROCESS_STATUSES 순서를 그대로 따르므로 시공 보드에서는 행위신고 앞에 붙는다.
   */
  const cols = [
    ...visible.filter((c) => c.band === band || c.alsoOn?.band === band),
    ...visible.filter((c) => c.band === '멈춤'),
  ];
  /** 그 보드에서 부르는 이름 — 같은 칸을 계약은 「냈다」로, 시공은 「기다린다」로 본다 */
  const labelOf = (c: (typeof cols)[number]) =>
    (c.alsoOn?.band === band ? c.alsoOn.label : c.label);

  /*
   * 계약과 시공이 남은 높이를 반씩 쓴다.
   *
   * 예전에는 띠 높이가 그 띠의 가장 많은 칸에 딸려 있었다. 계약에 현장이 몰려 있으면
   * 계약 줄만 길어지고 시공 줄은 카드 한 장 높이로 납작해져서, 시공 칸에 카드를 끌어다
   * 놓을 자리조차 좁았다 — 두 줄의 높이가 「몇 건 있나」에 따라 매번 달라졌다.
   *
   * 위쪽 chrome(제목·보기 막대·필터 줄·건수·본문 여백)이 14rem 쯤이라 그만큼 뺀다.
   * 13rem 이었다 — 필터가 제 줄로 내려오면서(+3rem) 띠 머리말이 사라진 것(-2rem)보다
   * 조금 더 늘었다(2026-08-26). 필터 판을 펴면 그만큼 페이지가 스크롤된다.
   * 창이 아주 낮으면 30rem 아래로는 줄이지 않고 그때는 페이지가 스크롤된다.
   *
   * 멈춤은 늘리지 않는다 — 한 칸짜리 줄이라, 세 줄을 똑같이 나누면
   * 계약중단 몇 건이 계약·시공과 같은 자리를 차지한다.
   */
  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[30rem] flex-col">
          <section
            aria-label={`${band} 구역`}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/*
              * 칸이 줄의 폭을 나눠 채운다.
              *
              * 예전에는 칸이 272px 고정이라 계약 5칸이 1400px 을 넘겼고, 창이 그보다 좁으면
              * 뒤쪽 칸이 화면 밖에 있었다 — 「어떤 현장이 어느 단계인가」를 답할 화면인데
              * 단계 절반이 안 보이면 답을 못 한다.
              *
              * minmax(200px, 1fr) 이라 넓은 창에서는 칸이 늘어 폭을 정확히 채우고,
              * 200px×칸수보다 좁아지면 그때만 이 줄이 가로로 밀린다.
              *
              * 칸 수가 줄마다 다르므로(계약 5 · 시공 5 · 멈춤 1) 인라인 스타일로 넘긴다 —
              * Tailwind 는 grid-cols-${n} 같은 동적 클래스를 만들지 못한다.
              *
              * 두 칸 이하인 줄은 늘리지 않는다. 「계약중단」 한 칸이 화면을 다 차지하면
              * 그게 이 화면에서 제일 중요한 것처럼 보인다.
              */}
            <div className="-mx-5 min-h-0 flex-1 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
              <div
                className="grid h-full gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols.length}, minmax(200px, ${
                    cols.length >= 3 ? '1fr' : '320px'
                  }))`,
                }}
              >
                {cols.map((col) => {
                  const list = columns.get(col.key) ?? [];
                  /*
                   * ★내 차례인 칸을 도드라지게★ (한백 지시 2026-09-10). 담당은 칸이 정하므로
                   * (lib/board courtOfColumn) 강조도 칸에 붙는다 — 카드마다 붙이면 같은 칸의
                   * 모든 카드에 같은 표시가 반복돼 아무것도 도드라지지 않는다.
                   *
                   * 비어 있는 칸은 강조하지 않는다 — 할 일이 없는데 눈이 가면 표시가 값을 잃는다.
                   * 멈춤 칸도 아니다: 거기 있는 것은 처리할 일이 아니라 멈춘 일이다.
                   */
                  const mine = col.band !== '멈춤' && list.length > 0 && isMyCourt(col.key, role);
                  return (
                    <section
                      key={col.key}
                      aria-label={`${labelOf(col)}${mine ? ' (내 차례)' : ''}`}
                      /* 멈춤 칸은 같은 줄 끝에 서므로 색으로만 가른다 — 흐름 칸과 다른 것임이 보여야 한다 */
                      className={`flex min-h-0 min-w-0 flex-col rounded-panel border p-2.5 ${
                        col.band === '멈춤'
                          ? 'border-slate-300 bg-slate-100/80'
                          : mine
                            ? 'border-brand-300 bg-brand-50/60'
                            : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                        <h3 className={`text-base font-black tracking-[-0.01em] ${
                          mine ? 'text-brand-900' : 'text-slate-800'
                        }`}>
                          {labelOf(col)}
                        </h3>
                        <span
                          className={`text-lead font-black tabular-nums ${
                            mine ? 'text-brand-800'
                              : list.length > 0 ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          {list.length}
                        </span>
                      </header>

                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                        {list.map((p) => (
                          <Card
                            key={p.id}
                            p={p}
                            busy={busyId === p.id}
                            canMove={canMove}
                            onMove={onMove}
                            tab={tab}
                            column={col.key}
                          />
                        ))}
                        {list.length === 0 && (
                          <p className="flex h-full items-center justify-center rounded-box border border-dashed border-slate-200 text-tiny text-slate-300">
                            없음
                          </p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </section>
    </div>
  );
}

/**
 * 카드 한 장.
 *
 * ★카드 아무 데나 눌러도 현장으로 들어간다.★ 예전에는 현장명 글자만 링크였다 —
 * 카드가 눌리는 물건처럼 생겼는데 정작 글자를 맞춰 눌러야 했다.
 * 키보드로도 들어갈 수 있게 role·tabIndex·Enter 를 둔다.
 */
function Card({
  p, busy, canMove, onMove, tab, column,
}: {
  p: ProjectSummary;
  busy: boolean;
  canMove: boolean;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  /** 상세를 열 때 먼저 보일 탭 — 이 보드의 국면을 따라간다 */
  tab: 'intake' | 'construction';
  /** 이 카드가 선 칸 — 무엇을 기다린 지 세는 기준이 칸마다 다르다 */
  column: BoardColumn;
}) {
  const router = useRouter();
  const qty = p.lines.reduce((sum, l) => sum + l.qty, 0);
  const org = p.salesOrg ?? p.gcOrg;
  // 계약연수는 라인마다 다를 수 있다 — 「7·10년」처럼 둘 다 적는다
  const terms = [...new Set(p.lines.map((l) => l.termYears))].sort((a, b) => a - b);
  /*
   * 다음 걸음을 카드가 민다 — 준비되면 여기서 바로 넘기고, 안 됐으면 무엇이 막는지
   * 카드에 적힌다(막는 문구는 게이트의 need 그대로). 계약 유도 단계(접수·검토·보완)와
   * 멈춘 현장에는 안 붙는다 — 그쪽의 다음 걸음은 서류·검수·재개라 이 축이 아니다.
   */
  const next = p.stage !== 'intake' && !p.holdState ? p.nextStep : null;

  /*
   * 되돌리는 걸음 — 미는 자리에 되돌리는 자리를 같이 둔다(화면 규칙 7).
   *
   * 카드의 「넘기기 →」는 한 번 누르면 옮겨지는데, 되돌리는 길은 상세의 스테퍼뿐이었다.
   * 게다가 시공의 첫 칸(행위신고)은 스테퍼에 앞 칸이 없다 — 운영사 계약서 제출은 계약
   * 국면이라 시공 스테퍼에 그리지 않는다. 그래서 보드에서 잘못 넘긴 현장이 시공 첫 칸에
   * 갇혔다(휴먼서희스타힐스 2026-08-25).
   *
   * 이름에 막는 것을 적지 않는다(화면 규칙 3) — 뒤로 가는 길은 늘 열려 있다
   * (lib/process canEnter: 지난 자리는 조건을 묻지 않는다).
   *
   * 계약 칸으로 돌아가면 이 카드는 시공 페이지에서 사라진다(계약 페이지에 선다) —
   * 그것이 되돌아갔다는 표시다. 어디로 가는지는 단추 이름이 이미 말한다.
   */
  const back =
    p.stage !== 'intake' && !p.holdState
      /* 앞 칸도 그 현장이 지나는 것 중에서 — 기설치 연동은 건너뛰는 칸이 있다 */
      ? prevStatusOf(p.status, { bizType: p.bizType })
      : null;

  /*
   * 협력사가 기다리는 대상 — 한백에게는 없다(조작할 사람이 자기다).
   *
   * ★남은 조건이 없을 때만 기다린다★ (2026-09-08 검증) — 전에는 조건을 안 봐서, 준공보완에
   * 선 협력사가 아직 자기 손에 있는 준공서류를 두고 「한백 준공마감 대기 중」을 읽었다.
   * 그 말이 실제로 막는 것을 덮어썼다(아래 hint 의 ?? 순서).
   */
  const waiting = !canMove && next?.ready ? partnerWaitingOf(next.status) : null;

  /*
   * 카드 밑에 적을 한 줄. 없으면 아무것도 안 적는다.
   *
   * ★「X 준비됨」을 지웠다(한백 지시 2026-08-26).★ 협력사 화면에서만 나오던 말이다 —
   * 한백은 준비되면 그 자리에 넘기는 단추가 뜨니까. 운영사 계약서 제출 칸의 협력사가
   * 「행위신고 준비됨」을 읽고 있었는데, 단계를 옮기는 것은 한백이라 그 말로 할 수 있는
   * 일이 없다. 조건이 없어서 열려 있다는 것은 우리 사정이지 그쪽의 다음 걸음이 아니다.
   *
   * 남는 것은 둘이다. 기다리는 대상(운영사 접수 대기 중)과, 아직 안 찬 조건
   * (다음: 환경부 승인일 · 행위신고 대상 여부) — 뒤엣것은 대개 그쪽이 할 일이다.
   */
  const hint = waiting ?? (next && !next.ready ? `다음: ${next.need}` : null);

  /*
   * ★반려·검토 요청 이후 며칠★ (한백 지시 2026-09-10). 옆의 정체일(stalledDays)과 다른
   * 값이다 — 저것은 「마지막 움직임 후」라 협력사가 파일 한 장만 올려도 0 이 된다.
   * 여기서 세는 것은 그 판정 자체의 시각이라 반려가 살아 있는 동안 계속 자란다.
   * 어느 칸에서 무엇을 세는지는 lib/board 가 정한다.
   */
  const waited = waitingSinceOf(column, p);

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`${p.name} 상세`}
      onClick={() => router.push(`/projects/${p.id}?tab=${tab}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`/projects/${p.id}?tab=${tab}`);
        }
      }}
      className={`cursor-pointer rounded-box border border-slate-200 bg-white p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${busy ? 'opacity-50' : ''}`}
    >
      <p className="break-keep text-lead font-bold leading-snug text-slate-900">{p.name}</p>
      <p className="mt-1 text-tiny leading-snug text-slate-500">
        {p.cpo} · {qty}대{terms.length ? ` · ${terms.join('·')}년` : ''}
      </p>
      {org && <p className="text-tiny leading-snug text-slate-400">{org}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {p.rejectedDocs > 0 && (
          <Tag tone="stop">반려 {p.rejectedDocs}</Tag>
        )}
        {/*
          */}
        {!p.priced && (
          <Tag>단가 미지정</Tag>
        )}
        {p.holdState && (
          <Tag tone="hold">{p.holdState}</Tag>
        )}
        {/*
          * 기다린 날은 ★늘 적는다★ — 며칠이 됐든 「그 칸에 언제부터 있었나」가 이 카드에서
          * 가장 먼저 알아야 하는 값이다. 정체일(오른쪽)은 14일부터만 뜨는 경고라 성격이
          * 다르다: 저것은 「너무 오래됐다」고 말하고, 이것은 「언제부터인가」를 말한다.
          * 색은 열흘을 넘으면 짙어진다 — 숫자만으로는 급한지 아닌지 안 읽힌다.
          */}
        {waited && (
          <Tag tone={waited.days >= 10 ? 'stop' : undefined}>
            {waited.label} {waited.days}일째
          </Tag>
        )}
        {p.stalledDays >= 14 && (
          <span
            className={`ml-auto text-micro font-black tabular-nums ${
              p.stalledDays >= 30 ? 'text-red-700' : 'text-amber-700'
            }`}
            title="마지막 진척 후 경과일"
          >
            {p.stalledDays}일
          </span>
        )}
      </div>

      {next && (
        next.ready && canMove ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation(); // 카드 자체는 상세로 가는 링크다 — 넘기기가 그걸 삼키면 안 된다
              onMove(p, next.status);
            }}
            className="mt-2 w-full rounded-ctl border border-brand-300 bg-brand-50 px-2 py-1 text-tiny font-bold text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
          >
            {next.status} 로 넘기기 →
          </button>
        ) : (
          /*
           * 협력사에게는 조작 이름 대신 기다리는 대상을 적는다 — 「다음: 제출 체크」는
           * 한백이 누를 것의 이름이라, 협력사는 자기가 체크해야 하는 줄 읽는다
           * (한백 지시 2026-08-24). 판정은 lib/board 가 한다.
           */
          hint && (
            <p className={`mt-2 text-micro font-semibold ${
              waiting ? 'text-slate-500' : 'text-amber-700'
            }`}>
              {hint}
            </p>
          )
        )
      )}

      {/*
        되돌리기는 넘기기와 같은 줄에 두지 않는다 — 반대쪽 끝이다(화면 규칙 8).

        ★밑줄 글자(undo)에서 고스트 칩(quiet)으로 올렸다★ (한백 지적 2026-08-31
        「계약확인 완료 후 운영사제출로 넘어가면 다시 계약확인 완료로 못 돌아가네」).
        길은 있었는데 회색 밑줄 글자 11px 라, 바로 위 초록 「넘기기 →」 옆에서 배경으로
        읽혔다 — 없는 것과 같았다. 같은 실수를 이미 한 번 했다(보완요청 단추가 안 보여
        kind="warn" 을 만든 자리). 각지면 누르는 것이다(화면 규칙 11).
        빨강은 쓰지 않는다 — 되돌아가는 것은 되돌릴 수 있는 일이다(화면 규칙 12).
      */}
      {canMove && back && (
        <div className="mt-1.5 flex" onClick={(e) => e.stopPropagation()}>
          <Btn
            kind="quiet"
            size="sm"
            busy={busy}
            busyLabel="되돌리는 중…"
            className="ml-auto break-keep text-left"
            onClick={() => onMove(p, back)}
          >
            ← {back} 로 되돌리기
          </Btn>
        </div>
      )}

      {/*
        * 멈춤·재개 — 한백만. 계약 국면 카드에서 계약중단(맨 끝 칸)으로 보낼 수 있어야 한다.
        * 멈춘 카드에는 재개가 선다. 컨트롤이 카드 클릭(상세 이동)을 삼키지 않게 막는다.
        */}
      {canMove && (p.holdState || p.stage === 'intake') && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <StopControl projectId={p.id} held={p.holdState} />
        </div>
      )}
    </article>
  );
}
