'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import FileViewer, { downloadHref } from '@/components/FileViewer';
import { Btn, Confirm, Err, GroupHead, Note, TEXT } from '@/components/ui';
import { dayOf } from '@/lib/date';
import { canPreviewFile, extOf, isImageFile, sizeLabel } from '@/lib/file-kind';
import { uploadSiteFile } from '@/lib/solar/site-upload';
import type { SiteFile } from '@/lib/solar/sites';

/**
 * 현장의 첨부파일 (한백 지시 2026-11-03 「파일 > 첨부파일 · 파일 미리보기 가능하게」).
 *
 * ★미리보기★ — 사진은 줄에 작은 그림이 서고, 이름을 누르면 이 화면 위에 미리보기 창이 뜬다(사진 · PDF · txt — 브라우저가
 * 그릴 수 있는 것, 판정은 lib/file-kind 로 전기차 서류 칸과 같다). 엑셀 · 워드 · 한글은 그릴 수 없어 이름이 곧 받기다.
 * 창에서 「새 탭」 · 「받기」로 이어 간다. 올리기는 묶음 머리의 단추(여러 장을 한 번에), 빼기는 줄의 반대쪽 끝이고 되묻는다
 * (화면 규칙 8 · Blob 에서도 지워져 되돌릴 수 없다). 열람 전용 · 남의 현장에는 올리기 · 빼기가 없다.
 *
 * @param unsent 접수 때 못 올린 장 수 — 접수 폼이 현장을 만든 뒤 파일을 올리다 실패하면 여기로 데려와 알린다
 */
export default function SiteFiles({ siteId, files, canEdit, unsent = 0 }: { siteId: string; files: SiteFile[]; canEdit: boolean; unsent?: number }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<SiteFile | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SiteFile | null>(null);

  async function upload(list: File[]) {
    if (!list.length) return;
    setError(null);
    const failed: string[] = [];
    for (const [i, f] of list.entries()) {
      try {
        await uploadSiteFile(siteId, f, (pct) => setBusy(`올리는 중 ${i + 1}/${list.length} · ${pct}%`));
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `${f.name} — 올리지 못했습니다`);
      }
    }
    setBusy(null);
    router.refresh();
    if (failed.length) setError(failed.join(' · '));
  }

  async function remove(f: SiteFile) {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/solar/sites/${siteId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: f.url }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setRemoveError(b.error ?? '빼지 못했습니다.');
        return;
      }
      setAsking(null);
      router.refresh();
    } catch {
      setRemoveError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <GroupHead
        title="첨부파일"
        meta={`${files.length}건`}
        action={
          canEdit && (
            <Btn kind="side" size="sm" busy={busy !== null} busyLabel={busy ?? undefined} onClick={() => picker.current?.click()}>
              올리기
            </Btn>
          )
        }
      />
      {canEdit && (
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
      )}
      {unsent > 0 && <Note className="mt-2">접수 때 첨부파일 {unsent}개를 못 올렸습니다 — 「올리기」로 다시 올려 주세요.</Note>}
      {files.length > 0 && (
        <ul className="mt-2">
          {files.map((f) => {
            const can = canPreviewFile(f);
            return (
              <li key={f.url} className="flex items-center gap-3 border-t border-slate-100 py-2 first:border-t-0">
                {/* 사진은 줄에서 바로 보인다 — 누르면 크게 */}
                {isImageFile(f) ? (
                  <button type="button" onClick={() => setViewing(f)} aria-label={`${f.name} 미리보기`} className="h-10 w-10 shrink-0 overflow-hidden rounded-tag border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tag border border-slate-200 bg-slate-50 text-micro font-black text-slate-500">
                    {extOf(f).toUpperCase()}
                  </span>
                )}
                {can ? (
                  <button
                    type="button"
                    onClick={() => setViewing(f)}
                    className="min-w-0 truncate text-left text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
                  >
                    {f.name}
                  </button>
                ) : (
                  // 그릴 수 없는 형식 — 이름이 곧 받기다
                  <a href={downloadHref(f)} download={f.name} className="min-w-0 truncate text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">
                    {f.name}
                  </a>
                )}
                <span className={`shrink-0 tabular-nums ${TEXT.meta}`}>
                  {sizeLabel(f.size)} · {dayOf(new Date(f.at))}
                </span>
                {canEdit && (
                  <span className="ml-auto shrink-0">
                    <Btn kind="undo" size="sm" onClick={() => setAsking(f)}>
                      빼기
                    </Btn>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Err className="mt-1.5 block">{error}</Err>
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
      <Confirm
        open={asking !== null}
        title="첨부파일을 뺄까요?"
        detail={asking ? `${asking.name} 이(가) 이 현장에서 빠지고 저장소에서도 지워집니다.` : undefined}
        confirmLabel="빼기"
        busy={removing}
        busyLabel="빼는 중…"
        error={removeError}
        onConfirm={() => asking && void remove(asking)}
        onCancel={() => {
          setAsking(null);
          setRemoveError(null);
        }}
      />
    </div>
  );
}

