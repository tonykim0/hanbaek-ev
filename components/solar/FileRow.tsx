'use client';

import type { ReactNode } from 'react';
import { Btn, TEXT } from '@/components/ui';
import { dayOf } from '@/lib/date';
import { canPreviewFile, extOf, isImageFile, sizeLabel } from '@/lib/file-kind';
import { fileHref } from '@/lib/blob/path';

const NAME = 'min-w-0 truncate text-left text-base font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900';

/**
 * 파일 한 줄 — 현장 첨부파일과 자료실이 같이 쓴다. 사진은 줄에서 작은 그림(누르면 크게), 이름은 그릴 수 있는 형식(사진 · PDF · txt)이면
 * 미리보기, 아니면(엑셀 · 워드 · 한글) 이름이 곧 받기다. 크기 · 날짜 뒤에 곁 동작(children), 빼기는 반대쪽 끝(화면 규칙 8).
 *
 * @param at       올린 때(ISO)
 * @param download 받는 주소 — 그릴 수 없는 형식의 이름이 이리 간다
 * @param onRemove 없으면 빼기를 세우지 않는다(열람 전용 · 남의 현장)
 */
export default function FileRow({
  file: f,
  at,
  download,
  onView,
  onRemove,
  children,
}: {
  file: { name: string; url: string; size: number };
  at: string;
  download: string;
  onView: () => void;
  onRemove?: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-t border-slate-100 py-2 first:border-t-0">
      {/* 사진은 줄에서 바로 보인다 — 누르면 크게 */}
      {isImageFile(f) ? (
        <button type="button" onClick={onView} aria-label={`${f.name} 미리보기`} className="h-10 w-10 shrink-0 overflow-hidden rounded-tag border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileHref(f.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>
      ) : (
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tag border border-slate-200 bg-slate-50 text-micro font-black text-slate-500">
          {extOf(f).toUpperCase()}
        </span>
      )}
      {canPreviewFile(f) ? (
        <button type="button" onClick={onView} className={NAME}>
          {f.name}
        </button>
      ) : (
        // 그릴 수 없는 형식 — 이름이 곧 받기다
        <a href={download} download={f.name} className={NAME}>
          {f.name}
        </a>
      )}
      <span className={`shrink-0 tabular-nums ${TEXT.meta}`}>
        {sizeLabel(f.size)} · {dayOf(new Date(at))}
      </span>
      {children}
      {onRemove && (
        <span className="ml-auto shrink-0">
          <Btn kind="undo" size="sm" onClick={onRemove}>
            빼기
          </Btn>
        </span>
      )}
    </li>
  );
}
