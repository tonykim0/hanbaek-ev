'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import FileViewer from '@/components/FileViewer';
import { Blank, Btn, BtnLink, Choice, Confirm, Err, FIELD_BASE, GroupHead, Note, PANEL, Picks, Saved, TEXT } from '@/components/ui';
import { dayOf } from '@/lib/date';
import {
  categoriesOf, filterLibrary, LIBRARY_CATEGORY_MAX, libraryPickOf, LOOSE_LABEL, type LibraryFile, type LibraryPick,
} from '@/lib/solar/library';
import { uploadLibraryFile } from '@/lib/solar/library-upload';
import { uploadEach } from '@/lib/upload-each';
import { useAction } from '@/lib/use-action';
import FileRow from './FileRow';

/**
 * 태양광 자료실 (2026-11-04, 한백 「태양광사업관리 페이지에서도 자료실 기능 · 제목은 그냥 자료실 · 우리가 업로드 · 왼쪽 사이드바」).
 *
 * 보는 사람은 태양광을 보는 계정 모두(한백 · 태양광 참여 협력사) — 이름을 누르면 미리보기(사진 · PDF · txt), 그 밖의 형식은 이름이
 * 곧 받기다. 올리기 · 빼기는 한백 관리자만(`canManage` — 서버도 한 번 더 본다, app/api/solar/library).
 * 올리기는 머리의 「올리기」가 여는 자리에서: 분류(비워도 된다 · 지금 있는 분류를 눌러 넣는다) → 「파일 골라 올리기」로 여러 장.
 * 같은 이름이면 교체되고 옛 본은 보관 자리에 남는다 — 몇 장이 교체였는지 올린 결과에 적는다.
 * 빼기는 줄의 반대쪽 끝이고 되묻는다(화면 규칙 8 · 12).
 * ★분류 칩 · 검색으로 거른다★(한백 2026-11-25 「필요한 자료를 바로 확인 할 수 있는 필터 … 지금은 분류별로 쭉 스크롤 해야해」 —
 * 전기차 운영사 자료실과 같은 규칙, 셈은 lib/solar/library filterLibrary). 칩은 묶음이 둘 이상일 때만 선다 · 고른 분류가 곧
 * 제목이라 그때는 묶음 머리를 안 적는다 · 걸어 둔 것은 주소에 남는다(?cat=분류&q=검색 · 분류 없음은 `cat=`).
 */
export default function Library({
  files,
  canManage,
  storageMissing,
  error,
}: {
  files: LibraryFile[];
  /** 한백 관리자 — 올리기 · 빼기 */
  canManage: boolean;
  storageMissing: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [query, setQuery] = useState(() => sp.get('q') ?? '');
  const [pick, setPick] = useState<LibraryPick>(() => libraryPickOf(sp.get('cat'), files));
  /* 걸어 둔 것은 주소에 남긴다 — replaceState 라 서버를 다시 부르지 않는다(현장 보드와 같은 방식) */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    for (const k of ['q', 'cat']) p.delete(k);
    if (query.trim()) p.set('q', query.trim());
    if (pick !== undefined) p.set('cat', pick ?? '');
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [query, pick]);
  // 고른 분류가 빠지면(그 분류의 마지막 자료를 뺐다) 전체로 — 없는 칩을 고른 채로 두지 않는다
  useEffect(() => {
    if (pick !== undefined && !files.some((f) => f.category === pick)) setPick(undefined);
  }, [files, pick]);

  const view = useMemo(() => filterLibrary(files, { query, category: pick }), [files, query, pick]);
  const categories = useMemo(() => categoriesOf(files), [files]);
  const last = files.length ? new Date(Math.max(...files.map((f) => Date.parse(f.uploadedAt)))) : null;
  // 분류가 하나도 없으면 머리 없이 한 목록이다 — 「분류 없음」 머리는 분류를 붙인 자료와 섞일 때만 · 고른 분류가 곧 제목일 때도 안 적는다
  const heads = view.chips.some((c) => c.category !== null) && pick === undefined;
  const filtering = Boolean(query.trim()) || pick !== undefined;

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LibraryFile | null>(null);
  const [asking, setAsking] = useState<LibraryFile | null>(null);
  const del = useAction();

  async function upload(list: File[]) {
    if (!list.length) return;
    setUploadError(null);
    setDone(null);
    const { ok, failed } = await uploadEach(list, (f, onPct) => uploadLibraryFile(category, f, onPct), (i, n, pct) => setBusy(`올리는 중 ${i + 1}/${n} · ${pct}%`));
    const replaced = ok.filter((r) => r.replaced).length;
    setBusy(null);
    if (ok.length) setDone(`${ok.length}개 올림${replaced ? ` · 그중 ${replaced}개는 같은 이름이라 교체` : ''}`);
    if (failed.length) setUploadError(failed.join(' · '));
    router.refresh();
  }

  async function remove(f: LibraryFile) {
    if (await del.run({ url: '/api/solar/library', method: 'DELETE', body: { pathname: f.pathname }, fail: '빼지 못했습니다.' })) setAsking(null);
  }

  return (
    <div className="max-w-[880px]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-black text-slate-900">자료실</h1>
        {canManage && !open && <Btn onClick={() => setOpen(true)}>올리기</Btn>}
      </div>
      <p className={`mb-5 mt-1.5 ${TEXT.meta} tabular-nums`}>
        {files.length}건{last && ` · 마지막 업데이트 ${dayOf(last)}`}
      </p>

      {canManage && open && (
        <div className={`${PANEL} mb-4 grid gap-3 p-4`} role="group" aria-label="자료 올리기">
          <GroupHead title="자료 올리기" />
          <div className="grid gap-1.5">
            <label className="grid max-w-xs gap-1.5">
              <span className={TEXT.label}>분류</span>
              <input
                className={`${FIELD_BASE} w-full`}
                value={category}
                maxLength={LIBRARY_CATEGORY_MAX}
                placeholder="비우면 분류 없이"
                disabled={busy !== null}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <Picks options={categories} onPick={setCategory} label="지금 있는 분류" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn busy={busy !== null} busyLabel={busy ?? undefined} onClick={() => picker.current?.click()}>
              파일 골라 올리기
            </Btn>
            <Btn kind="quiet" disabled={busy !== null} onClick={() => setOpen(false)}>
              닫기
            </Btn>
            {done && <Saved>{done}</Saved>}
            <Err>{uploadError}</Err>
          </div>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = ''; // 같은 파일을 다시 골라도 바뀜으로 잡히게
              void upload(list);
            }}
          />
        </div>
      )}

      {storageMissing && <Note className="mb-4">파일 저장소가 연결되지 않아 목록이 비어 있습니다.</Note>}
      {error && <Note tone="stop" className="mb-4">{error}</Note>}

      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* 분류 칩 — 묶음이 둘 이상일 때만. 고른 칩을 다시 누르면 전체로 */}
          {view.chips.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="분류">
              {[{ key: 'all', on: pick === undefined, label: '전체', count: view.all, to: undefined as LibraryPick },
                ...view.chips.map((c) => ({ key: c.category ?? '', on: pick === c.category, label: c.label, count: c.count, to: c.category as LibraryPick }))].map((c) => (
                <Choice key={c.key} on={c.on} onClick={() => setPick(c.on ? undefined : c.to)}>
                  {c.label}
                  <span className={`ml-1.5 tabular-nums ${c.on ? 'text-brand-on-fill/70' : 'text-slate-500'}`}>{c.count}</span>
                </Choice>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="자료명 검색"
              aria-label="자료명 검색"
              className={`${FIELD_BASE} w-44`}
            />
            {filtering && <span className={`whitespace-nowrap ${TEXT.meta} tabular-nums`}>{view.count}건</span>}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <Blank>자료 0건</Blank>
      ) : view.count === 0 ? (
        <div className="flex flex-col gap-3">
          <Blank>조건에 맞는 자료 0건</Blank>
          {/* 되돌릴 길을 그 자리에 둔다(운영사 자료실과 같다) */}
          <span className="text-center">
            <Btn size="sm" kind="quiet" onClick={() => { setQuery(''); setPick(undefined); }}>전체 자료 보기</Btn>
          </span>
        </div>
      ) : (
        <div className={`${PANEL} grid gap-5 p-5`}>
          {view.shown.map((g) => (
            <section key={g.category ?? ''} aria-label={g.category ?? LOOSE_LABEL}>
              {heads && <GroupHead title={g.category ?? LOOSE_LABEL} meta={`${g.files.length}건`} />}
              <ul className={heads ? 'mt-2' : ''}>
                {g.files.map((f) => (
                  <FileRow key={f.pathname} file={f} at={f.uploadedAt} download={f.downloadUrl} onView={() => setViewing(f)} onRemove={canManage ? () => setAsking(f) : undefined}>
                    <BtnLink kind="quiet" href={f.downloadUrl} download={f.name} className="shrink-0">
                      받기
                    </BtnLink>
                  </FileRow>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
      <Confirm
        open={asking !== null}
        title="자료를 뺄까요?"
        detail={asking ? `${asking.name} 이(가) 자료실에서 빠집니다 — 한 부는 목록 밖 보관 자리에 남습니다.` : undefined}
        confirmLabel="빼기"
        busy={del.busy}
        busyLabel="빼는 중…"
        error={del.error}
        onConfirm={() => asking && void remove(asking)}
        onCancel={() => {
          setAsking(null);
          del.setError(null);
        }}
      />
    </div>
  );
}
