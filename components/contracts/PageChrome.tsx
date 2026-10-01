'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface SubmitStatus {
  kind: 'success' | 'error';
  msg: string;
}

export interface NoticeSection {
  title: string;
  items: ReactNode[];
}

/**
 * 계약서 작성·실사보고서 작성 화면의 머리 — 되돌아가는 길 · 제목 · 본문.
 *
 * ★콘솔 안의 화면이다★ (한백 지시 2026-10-01 — 포털 hanbaek-form 을 닫고 이 기능들을 콘솔로 들였다).
 * 예전에는 포털의 머리말(SiteHeader)·바탕색·꼬리말까지 그렸다. 이제 껍데기(사이드바·상단바)는 콘솔
 * 레이아웃이 그리므로 여기는 다른 콘솔 화면(서류 재발행 등)과 같은 머리만 둔다.
 */
export function ContractPageShell({
  title,
  children,
  /*
   * 기본은 곁말 없음이다 (한백 지시 2026-08-29 · 화면 규칙 2).
   * 「필수 정보를 입력하면 …계약서가 자동으로 생성됩니다」가 기본값이었는데, 그것은
   * 아래 폼이 이미 하는 말이다 — 매일 쓰는 사람에게는 매번 지나치는 한 줄이었다.
   */
  subtitle = null,
  back = { href: '/contracts', label: '← 운영사 다시 선택' },
}: {
  /** 머리의 되돌아가는 길 — 실사보고서 작성은 그 목록으로 돌아간다 */
  back?: { href: string; label: string };
  title: string;
  children: ReactNode;
  /** null 이면 설명 줄을 두지 않는다 */
  subtitle?: string | null;
}) {
  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-base text-slate-500 transition hover:text-brand-700"
        >
          {back.label}
        </Link>
        <h1 className="text-h1 font-black text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-slate-500">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

/**
 * 「사전 현장 컨설팅 결과서만」 생성 버튼.
 *
 * 협력사가 잘못 채운 서류를 다시 받을 때 결과서 한 부만 필요한 경우가 많아서,
 * 전체 서류 생성과 나란히 두었습니다. 두 버튼 모두 type="submit"이라
 * 입력 검증은 똑같이 걸립니다 — 어느 쪽으로 뽑아도 값은 검수된 상태입니다.
 */
export interface DocScopeActionProps {
  /** 전체 서류 버튼 클릭 — 출력 범위를 'all'로 표시 */
  onSelectAll: () => void;
  /** 컨설팅결과서만 버튼 클릭 — 출력 범위를 'consulting'으로 표시 */
  onSelectConsulting: () => void;
  includeAttachments: boolean;
  onIncludeAttachmentsChange: (value: boolean) => void;
  /** 사진대지·체크리스트가 템플릿에 있는 CPO에서만 토글을 보여줍니다 */
  showAttachmentToggle?: boolean;
}

export function FormActions({
  status,
  isSubmitting,
  submitLabel = '계약서 생성 및 다운로드',
  submittingLabel = '생성 중...',
  docScope,
}: {
  status: SubmitStatus | null;
  isSubmitting: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  docScope?: DocScopeActionProps;
}) {
  return (
    <div className="sticky bottom-4 z-20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 backdrop-blur px-4 sm:px-5 py-3 shadow-lg">
      <div className="text-sm min-w-0">
        {status ? (
          <p
            className={
              status.kind === 'success'
                ? 'text-green-700'
                : 'text-red-600 font-medium'
            }
          >
            {status.kind === 'success' ? '✅ ' : '⚠️ '}
            {status.msg}
          </p>
        ) : (
          <p className="text-gray-400">입력을 마치면 아래 버튼으로 계약서를 생성하세요</p>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2 sm:flex-row sm:items-center">
        {docScope && (
          <>
            {docScope.showAttachmentToggle && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={docScope.includeAttachments}
                  onChange={(e) =>
                    docScope.onIncludeAttachmentsChange(e.target.checked)
                  }
                  className="rounded-ctl border-slate-300 text-brand-600 focus:ring-brand-100"
                />
                사진대지 · 체크리스트 포함
              </label>
            )}
            <button
              type="submit"
              onClick={docScope.onSelectConsulting}
              disabled={isSubmitting}
              className="flex-none border border-brand-600 text-brand-700 hover:bg-brand-50 disabled:border-gray-300 disabled:text-gray-400 font-semibold px-4 py-3 rounded-lg transition whitespace-nowrap"
            >
              컨설팅결과서만
            </button>
          </>
        )}
        <button
          type="submit"
          onClick={docScope?.onSelectAll}
          disabled={isSubmitting}
          className="flex-none bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition whitespace-nowrap"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}
