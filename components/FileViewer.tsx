'use client';

import { useEffect } from 'react';
import { Btn, BtnLink, TEXT } from '@/components/ui';
import { extOf, isImageFile, sizeLabel } from '@/lib/file-kind';
import { fileHref } from '@/lib/blob/path';

/**
 * 미리보기 창 — 이 화면 위에 뜬다(새 탭으로 나가지 않고 보고 닫는다). 사진은 창에 맞춰, PDF · txt 는 브라우저가 그린다.
 * Esc · 바깥 누르기 · 「닫기」로 닫는다. 창은 상자 한 겹이다(화면 규칙 1).
 * 태양광 현장 첨부파일(components/solar/SiteFiles)에서 꺼냈다 — 태양광 자료실이 같이 쓴다(2026-11-04).
 *
 * 「받기」는 Blob 의 내려받기 주소(?download=1)다 — 다른 출처의 주소라 a 의 download 속성을 브라우저가 무시해서, 그 속성만으로는
 * PDF 가 받아지지 않고 이 탭에서 열렸다.
 */
export default function FileViewer({
  file,
  onClose,
}: {
  file: { url: string; name: string; size?: number; downloadUrl?: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`${file.name} 미리보기`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-panel border border-slate-200 bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <p className="min-w-0 truncate text-lead font-black text-slate-900">{file.name}</p>
          {file.size !== undefined && <span className={`shrink-0 tabular-nums ${TEXT.meta}`}>{sizeLabel(file.size)}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <BtnLink kind="quiet" href={fileHref(file.url)} target="_blank" rel="noopener noreferrer">
              새 탭
            </BtnLink>
            <BtnLink kind="quiet" href={downloadHref(file)} download={file.name}>
              받기
            </BtnLink>
            <Btn kind="quiet" size="sm" onClick={onClose}>
              닫기
            </Btn>
          </span>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100">
          {isImageFile(file) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={fileHref(file.url)} alt={file.name} className="h-full w-full object-contain" />
          ) : (
            <iframe src={extOf(file) === 'pdf' ? `${fileHref(file.url)}#view=FitH` : fileHref(file.url)} title={file.name} className="h-full w-full border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

/** 내려받는 주소 — 우리 파일이면 파일 문의 받기(?download=1 — 서명 주소가 첨부로 내려준다), 아니면 그대로 */
export function downloadHref(file: { url: string; downloadUrl?: string }): string {
  return fileHref(file.downloadUrl ?? file.url, { download: true });
}
