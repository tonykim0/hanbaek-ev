'use client';

import { useEffect, useRef, useState } from 'react';
import { checkParams } from '@/lib/solar/check-query';
import type { Mode, Report, Suggestion } from '@/lib/solar/types';

/** 부지 검토 한 번 — /api/solar/check. 실패하면 그 까닭(한글)을 던진다 */
export async function fetchSiteReport(mode: Mode, q: string, picked?: Suggestion): Promise<Report> {
  const res = await fetch(`/api/solar/check?${checkParams(mode, q, picked)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `검토 실패 (${res.status})`);
  return body as Report;
}

/**
 * 부지 검토 결과 하나를 불러오는 상태 — 도는 갈래 · 실패(그 갈래 — 누른 검색창 밑에 뜬다) · 결과. 결과 자리가 하나라 한 번에 하나만 돈다.
 * 부지 검토(Checker)와 제안서 생성(ProposalMaker)의 「1 현장」이 같이 쓴다.
 *
 * @param initial 들고 온 주소 — 처음 한 번만 돈다(다시 그려질 때마다 돌면 바깥 자료의 하루 한도를 깎는다)
 */
export function useSiteReport(initial: { q: string; mode: Mode } | null) {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<{ mode: Mode; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function run(mode: Mode, q: string, picked?: Suggestion) {
    if (!q.trim() || busy) return;
    setBusy(mode);
    setError(null);
    try {
      setReport(await fetchSiteReport(mode, q, picked));
    } catch (err) {
      setReport(null);
      setError({ mode, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const started = useRef(false);
  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    void run(initial.mode, initial.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번
  }, []);

  return { report, busy, error, run };
}
