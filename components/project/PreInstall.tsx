'use client';

/**
 * 기설치 조사 — 조사 결과(있음/없음 + 내역)와 서류 두 칸(설치이력·증빙).
 *
 * 한때 조사 입력을 걷어내고 「파일이 곧 조사 결과」로 뒀는데, 파일만으로는 몇 대·몇 kW·
 * 어느 운영사인지가 화면에 남지 않아 조사 내역 입력을 되살렸다(한백 지시 2026-08-23).
 * 저장 경로는 원래 있던 것이다 — PATCH /preinstall 이 있음/없음·내역·조사 표시를 받는다.
 *
 * 서류 목록에서 빼내 자기 구역에 두는 것은 유지한다 — 현장마다 해야 하는 일이라
 * 증빙이 서류 열여섯 칸 사이에 섞여 있으면 조사가 됐는지 보이지 않는다.
 */
import { useState } from 'react';
import { reviewKindLabel } from '@/lib/review-labels';
import type { PreInstall as PreInstallState, ProjectDetail, ProjectDocument } from '@/types/project';
import { evaluateDocs, needsPreInstallCheck } from '@/lib/doc-rules';
import { DocDelete, DocFileActions, DocUpload, DownloadAll } from '@/components/DocFiles';
import { useAction } from '@/lib/use-action';
import { Badge, Btn, Choice, Empty, Err, FIELD, GroupHead, Tag, TEXT } from '@/components/ui';
import { DocReview } from './DocReview';
import { PreInstallCheckBlock } from './PreInstallCheck';
import {
  checkedFilesOf, missingSeals, sameFiles, sealFixReason, type PreInstallCheck,
} from '@/lib/preinstall-check';
import { docCardTone, docState, RejectReason } from './parts';
import { LookupResults, useShardLoader } from '@/components/ChargerHistoryLookup';
import {
  DATA_BASE, lookupChargerHistory, type IndexMeta, type LookupResult, type SiteRecord,
} from '@/lib/charger-history';
import {
  lookupSubsidyHistory, SUBSIDY_DATA_BASE, type SubsidyMeta, type SubsidyRecord,
} from '@/lib/subsidy-history';
import chargerMeta from '@/public/data/charger-history/meta.json';
import subsidyMeta from '@/public/data/subsidy-history/meta.json';

export function PreInstall({
  project, docs, byKind, siteName, canReview, canRemove = false,
  canEditDocs = false, canFillEmpty = false, surveyText, check = null,
}: {
  /** 설치이력 엑셀 ↔ 증빙의 마지막 대조 (lib/preinstall-check) */
  check?: PreInstallCheck | null;
  project: ProjectDetail['project'];
  docs: ReturnType<typeof evaluateDocs>;
  byKind: Map<string, ProjectDocument>;
  siteName: string;
  canReview: boolean;
  /** 파일 한 장을 뺄 수 있는가 — 내는 쪽(협력사)과 한백 (열람 전용은 아니다) */
  canRemove?: boolean;
  /**
   * 올릴 수 있는가 — ★서류 구역과 같은 잠금★ (반박 검토 2026-09-05, 감사 M15).
   * 기설치 두 칸도 documents 표의 계약 서류라 저장소는 같은 판정(assertContractDocsOpen)으로
   * 막는데, 화면은 단추를 무조건 그리고 있었다 — 착공 뒤 협력사에게 눌리지 않는
   * 「다시 업로드」가 서 있고 바로 위 안내는 「바꿀 수 없다」고 말했다(두 벌).
   * 판정은 canChangeContractDocs 한 곳, 값은 IntakeTab 이 내려준다.
   */
  canEditDocs?: boolean;
  /** 빈 칸에는 올릴 수 있는가 — 잠긴 뒤의 예외, 착공 전까지(IntakeTab 의 같은 이름 주석) */
  canFillEmpty?: boolean;
  /**
   * 조사 내역을 글자로 — 묶음에 .txt 로 같이 들어간다.
   *
   * ★파일이 아니라 입력값이라 빠뜨리기 쉽다★ (2026-08-25 에 서류 묶음에서 겪은 것과
   * 같은 자리다): 대수·kW·운영사가 적힌 조사 결과는 올린 파일이 아니어서, 파일만 받으면
   * 그 내역이 화면에만 남아 사람이 옮겨 적어야 했다. 만드는 자리는 IntakeTab 한 곳이다 —
   * 여기서 다시 만들면 두 묶음의 글이 갈린다.
   */
  surveyText?: string | null;
}) {
  /*
   * 자체투자는 기설치 조사를 하지 않는다 — 환경부 보조금이 기설치 여부로 갈리기 때문에
   * 하는 조사이고, 보조금을 안 받으면 조사할 이유가 없다(2026-08-20 한백 확인).
   * 구역을 없애지 않는다 — 「안 올림」과 「해당없음」은 다른 것이다.
   */
  if (!needsPreInstallCheck(project.bizType)) {
    /*
     * ★조사는 해당없음이어도 온 파일은 보인다★ (2026-10-06). 접수 판독이 행위신고증명서·
     * 필증·예전 계약서를 기설치 증빙 칸에 넣는데(doc-category-map), 자체투자 현장에서는
     * 이 구역이 배지 하나뿐이라 그 파일이 화면 어디에도 없었다. 파일이 있는 칸만 그리고,
     * 조사·올리기·반려는 그대로 없다 — 빼기만 둔다(잘못 온 장을 걷어낼 길).
     */
    const filed = docs.filter((d) => (byKind.get(d.key)?.files.length ?? 0) > 0);
    return (
      <section>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className={TEXT.section}>기설치 조사</h2>
          <Badge>해당없음</Badge>
        </div>
        {filed.length > 0 && (
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filed.map((d) => (
              <PreDocCard
                key={d.key}
                d={d}
                doc={byKind.get(d.key)}
                projectId={project.id}
                siteName={siteName}
                canReview={false}
                canRemove={canRemove}
                canEditDocs={false}
                canFillEmpty={false}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  /*
   * ★직인이 없으면 설치이력 칸의 반려가 그 까닭을 들고 연다★ — 반려하는 문은 칸의 「반려」 하나다(UI 리뷰
   * 2026-10-07: 대조 결과에 따로 둔 「보완요청 — 직인 없음」과 칸의 「반려」가 같은 칸을 돌려보내는 두 길이었다).
   * 서류가 바뀐 지난 결과로는 제안하지 않는다 — 고쳐 올린 것을 다시 돌려보내게 된다.
   */
  const current = checkedFilesOf([...byKind.values()]);
  const sealGap = check?.seal && sameFiles(check.files, current) && missingSeals(check.seal).length > 0
    ? check.seal : null;
  const suggestFor = (kind: string) =>
    kind === 'legacylog' && sealGap ? { label: '직인 없음', reason: sealFixReason(sealGap) } : null;

  return (
    /*
     * ★걸음 셋으로 선다★ (UI 리뷰 2026-10-07 「뒤죽박죽에 보기 쉽지 않다」) — 이력 조회(공공 자료) → 서류·대조
     * (낸 서류끼리) → 현장 확인 결과. 걸음마다 번호 붙은 머리(ui GroupHead)이고 사이는 얇은 선 하나다(규칙 1).
     * 대조가 이력 조회 바로 밑인 것은 그대로다(한백 지시 2026-10-07 「이력 조회 밑에 넣어주고 검증 필수」) —
     * 서류 두 칸을 그 걸음 안으로 올렸다: 대조가 판정하는 것이 그 두 칸이다.
     * 기설치 있음/없음은 3 걸음 한 곳에만 둔다 — 제목 배지·대조의 「조사 결과」 줄과 세 번 있었다(규칙 5).
     */
    <section className="flex flex-col gap-4">
      {/*
        ★받는 단추는 제목 옆이다★ (한백 지시 2026-08-31) — 서류 구역과 같은 꼴이다. 계약 서류의 「전체 다운로드」에도
        기설치 파일이 들어가지만, 기설치만 따로 받을 일이 따로 있다(운영사 제출·조사 재확인).
      */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <h2 className={TEXT.section}>기설치 조사</h2>
        {!project.preChecked && <Tag tone="warn">조사 필요</Tag>}
        {/* 테두리 있는 단추는 baseline 에서 조금 내려앉는다 — 글자 줄이 아니라 가운데에 맞춘다 */}
        <span className="self-center">
          <DownloadAll
            docs={docs.map((d) => byKind.get(d.key)).filter((d): d is ProjectDocument => Boolean(d))}
            siteName={siteName}
            labelOf={(kind) => docs.find((d) => d.key === kind)?.label ?? reviewKindLabel(kind)}
            extra={surveyText ? [{ name: '기설치 조사내역', text: surveyText }] : []}
          />
        </span>
      </div>

      <Lookup project={project} />

      <div className="border-t border-slate-100 pt-3">
        <PreInstallCheckBlock
          projectId={project.id}
          check={check}
          currentFiles={current}
          canRun={canReview}
          hasSheet={(byKind.get('legacylog')?.files.length ?? 0) > 0}
          logRejected={byKind.get('legacylog')?.status === 'rejected'}
          docs={
            /*
              격자는 서류 구역과 같다 (한백 지시 2026-09-03 「서류 컴포넌트랑 맞춰줘. 너무 넓어」) — 칸이 둘뿐이라고
              2열로 넓히면 같은 서류 카드가 두 구역에서 다른 폭이 된다.

              ★조사 반려는 없다★ (2026-09-03, migrations/0050) — 돌려보내는 문은 칸의 「반려」(파일이 있으면)와
              계약 탭의 「누락 서류 N건 보완요청」(없으면) 둘이다.
            */
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {docs.map((d) => (
                <PreDocCard
                  key={d.key}
                  d={d}
                  doc={byKind.get(d.key)}
                  projectId={project.id}
                  siteName={siteName}
                  canReview={canReview}
                  canRemove={canRemove}
                  canEditDocs={canEditDocs}
                  canFillEmpty={canFillEmpty}
                  suggest={suggestFor(d.key)}
                />
              ))}
            </div>
          }
        />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <SurveyResult project={project} />
      </div>
    </section>
  );
}

/** 기설치 서류 한 칸 — 조사 구역과 「해당없음」 구역(자체투자인데 파일이 온 칸)이 같이 쓴다 */
function PreDocCard({
  d, doc, projectId, siteName, canReview, canRemove, canEditDocs, canFillEmpty, suggest = null,
}: {
  /** 반려할 까닭을 이미 안다 — 대조가 짚은 직인 없음(설치이력 칸). 반려 단추가 그 말을 들고 연다 */
  suggest?: { label: string; reason: string } | null;
  d: ReturnType<typeof evaluateDocs>[number];
  doc: ProjectDocument | undefined;
  projectId: string;
  siteName: string;
  canReview: boolean;
  canRemove: boolean;
  canEditDocs: boolean;
  canFillEmpty: boolean;
}) {
  const st = docState(doc, d.req);
  return (
    /*
      relative — 끌어다 놓는 덮개가 이 칸을 덮는다(DocFiles 의 DocUpload).
      바탕은 서류 카드와 같은 규칙이다(docCardTone) — 그전에는 이 카드만 늘
      흰 바탕이라, 같은 반려가 계약 서류에서는 주황이고 여기서는 색이 없었다.
    */
    <div className={`relative flex flex-col rounded-box border p-2.5 ${docCardTone(doc, d.req)}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="break-keep text-small font-bold leading-snug text-slate-800">
          {d.label}
          {d.ext && <span className="ml-1.5 text-micro font-bold text-slate-400">{d.ext}</span>}
        </p>
        <span className={`shrink-0 text-micro font-black ${st.tone}`}>{st.label}</span>
      </div>
      {doc?.uploadedAt && <p className="mt-1 text-tiny text-slate-400">{doc.uploadedAt}</p>}
      {doc?.rejectReason && <RejectReason>{doc.rejectReason}</RejectReason>}

      {/*
        * 서류 칸과 같은 세 구역이다 — 사실 · 파일 목록 · 조작 (IntakeTab 의 카드 주석 참조).
        * 같은 서류를 두 구역에서 다른 모양으로 보여주면 어느 쪽이 맞는지 물어야 한다.
        */}
      {doc && doc.files.length > 0 && (
        <div className="mt-2 border-t border-slate-900/[0.07] pt-2">
          <DocFileActions
            doc={doc}
            siteName={siteName}
            label={d.label}
            projectId={projectId}
            canRemove={canRemove}
          />
        </div>
      )}

      {/*
        * 조작 줄은 담을 것이 있을 때만 — 서류 구역(IntakeTab)과 같은 조건이다.
        * 올리기는 잠금 판정을 따른다(canEditDocs, 빈 칸이면 canFillEmpty) — 서버가
        * 거절할 단추를 세우지 않는다(화면 규칙 3).
        */}
      {(canEditDocs || (canFillEmpty && (!doc || doc.files.length === 0)) || canReview) && (
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-900/[0.07] pt-2">
        {(canEditDocs || (canFillEmpty && (!doc || doc.files.length === 0))) && (
          <DocUpload
            projectId={projectId}
            kind={d.key}
            rejected={doc?.status === 'rejected'}
            fileCount={doc?.files.length ?? 0}
            single={!canEditDocs && canFillEmpty && (!doc || doc.files.length === 0)}
          />
        )}
        <span className="flex-1" />
        {/*
          * ★안 낸 칸도 반려한다★ — 계약 서류 격자와 같은 규칙이다
          * (한백 지시 2026-09-03). 그 변경이 서류 구역(IntakeTab)에만 오고
          * 이 격자는 `doc && doc.status !== 'none'` 으로 남아 있었다 — 칸에
          * 행이 아예 없으면(아직 아무도 안 올림) 반려 단추가 서지 않아,
          * 기설치 이력을 안 낸 현장을 짚어 돌려보낼 길이 없었다
          * (한백 지적 2026-09-06, 경남 양산 대우마리나 아파트).
          *
          * 저장소는 처음부터 받아 준다 — checkReviewable 이 「행이 없어도
          * 반려는 선다」이고 setDocumentStatus 가 행을 만든다. 화면만 막고
          * 있었으니, 서버가 허락하는 일을 단추가 없어서 못 하던 자리다.
          */}
        {canReview && (
          <DocReview
            projectId={projectId}
            kind={d.key}
            status={doc?.status ?? 'none'}
            hasFile={(doc?.files.length ?? 0) > 0}
            suggest={suggest}
          />
        )}
        {canReview && doc && doc.status !== 'none' && (
          <DocDelete
            projectId={projectId}
            kind={d.key}
            label={d.label}
            filename={doc.filename}
            count={doc.files.length}
          />
        )}
      </div>
      )}
    </div>
  );
}


/*
 * 1 이력 조회 — /lookup 과 같은 조회를 현장 주소로 돌린다(한백 확인 2026-08-23: 실무 순서가 「이력 조회로 1차 확인 →
 * 영업자가 고객사·현장에서 재확인」). ★조회는 읽기만 한다★ — 결과를 조사 내역에 옮겨 주지 않는다(2026-09-03, 조회한
 * 것이 조사한 것처럼 저장된다). 결과는 /lookup 이 그리는 카드 그대로다(LookupResults — 요약을 따로 만들면 갈린다).
 *
 * ★결과를 접는다★ (UI 리뷰 2026-10-07) — 카드 여러 장이 펼쳐지면 2·3 걸음이 화면 아래로 한참 밀렸다.
 */
function Lookup({ project }: { project: ProjectDetail['project'] }) {
  const loadCharger = useShardLoader<SiteRecord>(DATA_BASE);
  const loadSubsidy = useShardLoader<SubsidyRecord>(SUBSIDY_DATA_BASE);
  const [looking, setLooking] = useState(false);
  const [open, setOpen] = useState(true);
  const [found, setFound] = useState<{
    charger: LookupResult;
    subsidy: LookupResult<SubsidyRecord>;
  } | null>(null);
  const [lookErr, setLookErr] = useState<string | null>(null);

  async function firstLook() {
    if (!project.addr) return;
    setLooking(true);
    setLookErr(null);
    try {
      const input = { road: project.addr, jibun: '' };
      const [charger, subsidy] = await Promise.all([
        lookupChargerHistory(input, loadCharger),
        lookupSubsidyHistory(input, loadSubsidy),
      ]);
      setFound({ charger, subsidy });
      setOpen(true);
    } catch (e) {
      setLookErr((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <GroupHead step={1} title="이력 조회">
        <span className="self-center">
          <Btn
            size="sm"
            kind="side"
            busy={looking}
            busyLabel="조회 중…"
            disabled={!project.addr}
            onClick={() => void firstLook()}
          >
            {!project.addr ? '주소 미지정 — 이력 조회 불가' : found ? '다시 조회' : '주소로 이력 조회'}
          </Btn>
        </span>
        {found && (
          <span className="self-center">
            <Btn size="sm" kind="quiet" onClick={() => setOpen((v) => !v)}>{open ? '결과 접기' : '결과 펼치기'}</Btn>
          </span>
        )}
        <Err>{lookErr}</Err>
      </GroupHead>
      {found && open && (
        <div className="flex max-w-3xl flex-col gap-2">
          <LookupResults
            charger={found.charger}
            subsidy={found.subsidy}
            meta={chargerMeta as IndexMeta}
            subsidyMeta={subsidyMeta as SubsidyMeta}
          />
          {/* 이력은 원본 등록분일 뿐, 대수 확정은 현장이 한다 (한백 문구) */}
          <p className="px-1 text-small font-semibold leading-snug text-amber-800">
            현장별로 실제 기설치 대수 반드시 확인 필요 — 보조금 불가 시 추후 보조금 환수 및 패널티 적용 예정
          </p>
        </div>
      )}
    </div>
  );
}

/*
 * 3 현장 확인 결과 — 있음/없음과 조사 내역(대수·kW·운영사·보조금 이력 등). ★기설치 있음/없음은 여기 한 곳이다★.
 * 평소엔 글자로 굳히고 「수정」을 눌러야 열린다(화면 규칙 4번). 저장에 preChecked 를 같이 실어 「조사했다」가 된다.
 * 열람 전용의 쓰기는 서버(write-route)가 막는다.
 */
function SurveyResult({ project }: { project: ProjectDetail['project'] }) {
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<PreInstallState>(project.preInstall);
  const [note, setNote] = useState(project.preNote ?? '');

  async function save() {
    const ok = await run({
      url: `/api/projects/${project.id}/preinstall`,
      method: 'PATCH',
      body: { preInstall: state, preNote: note.trim() || null, preChecked: true },
      fail: '조사 내역을 저장하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <GroupHead step={3} title="현장 확인 결과">
        {/* 안내문을 두지 않는다(규칙 2) — 무엇을 하라는 말은 단추 이름이 한다 */}
        {!editing && (
          <span className="self-center">
            <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>
              {project.preChecked ? '조사 내역 수정' : '조사 내역 적기'}
            </Btn>
          </span>
        )}
      </GroupHead>
      {editing ? (
        <div className="flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`mr-1 ${TEXT.label}`}>기설치</span>
            {(['없음', '있음'] as const).map((v) => (
              <Choice key={v} on={state === v} onClick={() => setState(v)}>{v}</Choice>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder="조사에서 알아낸 것 — 대수 · kW · 운영사 · 설치 시기 · 보조금 수령 여부 등"
            className={FIELD}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn busy={busy} busyLabel="저장 중…" onClick={() => void save()}>
              조사 결과 저장
            </Btn>
            <Btn
              kind="quiet"
              disabled={busy}
              onClick={() => { setEditing(false); setState(project.preInstall); setNote(project.preNote ?? ''); }}
            >
              취소
            </Btn>
            <Err>{error}</Err>
          </div>
        </div>
      ) : project.preChecked ? (
        <div className="flex max-w-3xl flex-col gap-1">
          <p className={TEXT.body}><b>기설치 {project.preInstall}</b></p>
          {/* 조사는 했는데 적은 글이 없다 — 파일만 온 현장이다. 담담한 회색이다 */}
          {project.preNote
            ? <p className={`whitespace-pre-line break-keep ${TEXT.body}`}>{project.preNote}</p>
            : <Empty kind="wait" label="내역 없음" />}
        </div>
      ) : (
        <Empty kind="miss" />
      )}
    </div>
  );
}
