'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import FileViewer from '@/components/FileViewer';
import { Blank, Btn, BtnLink, Confirm, Err, FIELD_BASE, GroupHead, Note, PANEL, Picks, Saved, TEXT } from '@/components/ui';
import { dayOf } from '@/lib/date';
import { categoriesOf, groupLibrary, LIBRARY_CATEGORY_MAX, LOOSE_LABEL, type LibraryFile } from '@/lib/solar/library';
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
  const groups = useMemo(() => groupLibrary(files), [files]);
  const categories = useMemo(() => categoriesOf(files), [files]);
  const last = files.length ? new Date(Math.max(...files.map((f) => Date.parse(f.uploadedAt)))) : null;
  // 분류가 하나도 없으면 머리 없이 한 목록이다 — 「분류 없음」 머리는 분류를 붙인 자료와 섞일 때만
  const heads = groups.some((g) => g.category !== null);

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

      {files.length === 0 ? (
        <Blank>자료 0건</Blank>
      ) : (
        <div className={`${PANEL} grid gap-5 p-5`}>
          {groups.map((g) => (
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
