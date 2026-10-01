'use client';

/**
 * 실사보고서 임시 저장 — 클라우드에 (한백 지시 2026-10-01 「브라우저 데이터 말고 클라우드에 저장」).
 *
 * 값(거점·표시·체크리스트)은 DB(survey_drafts), 사진은 Blob(survey-drafts/<계정>/<저장본>/). 그래서
 * 다른 컴퓨터·휴대폰에서도 같은 계정으로 들어오면 이어 쓴다. 계정마다 여럿 — 같은 서식으로 두 현장을
 * 번갈아 써도 서로 덮지 않는다(브라우저에 둘 때는 서식마다 하나라 덮였다).
 *
 * ★사진은 줄여서 올린다★ — 휴대폰 원본(5~10MB)을 거점마다 열 장씩 올리면 현장에서 데이터가 버틴다.
 * 방향을 바로 하고 긴 변 2400px 로(서식에 들어가는 것은 1600px — lib/survey/prepare-image). 줄일 수
 * 없는 사진(브라우저가 못 여는 HEIC 등)은 그대로 올린다. 한 번 올린 사진은 다시 올리지 않는다.
 *
 * ★저장한 뒤에 바꾼 것이 있으면 나갈 때 묻는다★ — 「실사보고서 작성을 중단하시겠습니까?」. 사이드바의
 * 다른 메뉴를 누르면 이 화면이 사라지고 넣은 것이 초기화된다(lib/use-leave-guard 가 링크를 가로챈다).
 * 저장한 그대로면 묻지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import type { DraftCpo, DraftFull, DraftSummary, PhotoRef } from './draft-shape';

export const LEAVE_MESSAGE = '실사보고서 작성을 중단하시겠습니까? 임시 저장하지 않은 내용은 초기화됩니다.';

/** 이 화면에서 올렸거나 내려받은 사진 → 그 자리. 같은 사진을 두 번 올리지 않는다 */
const uploaded = new WeakMap<Blob, PhotoRef>();

/** 값 속 사진(File)들 — 순서대로, 겹치지 않게 */
function filesOf(v: unknown, out: Blob[] = []): Blob[] {
  if (v instanceof Blob) { if (!out.includes(v)) out.push(v); return out; }
  if (Array.isArray(v)) v.forEach((x) => filesOf(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => filesOf(x, out));
  return out;
}

/** 사진 → 자리, 자리 → 사진으로 바꾼 값 */
function swap(v: unknown, f: (x: unknown) => unknown | undefined): unknown {
  const hit = f(v);
  if (hit !== undefined) return hit;
  if (Array.isArray(v)) return v.map((x) => swap(x, f));
  if (v && typeof v === 'object' && !(v instanceof Blob)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x, f)]));
  }
  return v;
}

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
    return out ?? file;
  } catch {
    return file;
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `요청이 실패했습니다 (${res.status})`);
  return body;
}

async function uploadPhoto(draftId: string, file: File): Promise<PhotoRef> {
  const { token, pathname } = await api<{ token: string; pathname: string }>(
    `/api/survey-drafts/${draftId}/photo`, { method: 'POST' }
  );
  const body = await shrink(file);
  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, body, { access: 'public', token, contentType: body.type || 'image/jpeg' });
  const type = body.type || file.type || 'image/jpeg';
  const name = body === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return { __photo: true, url: blob.url, path: pathname, name, type };
}

/**
 * @param cpo   서식 — 저장본 목록이 서식별이다
 * @param value 지금 화면의 값(사진 포함). 바뀔 때마다 새 객체여야 한다(React 상태 그대로)
 * @param apply 저장본을 화면에 되살린다
 * @param title 저장본 이름 — 현장명
 * @param busy  만드는 중 — 그동안 나가도 묻는다
 */
export function useSurveyDraft<T>(cpo: DraftCpo, value: T, apply: (v: T) => void, title: string, busy = false) {
  /** 마지막으로 저장(또는 불러온) 값 — 이것과 다르면 「바뀐 것이 있다」 */
  const base = useRef<T>(value);
  const [id, setId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  /** 도는 일 — 「사진 올리는 중 3/12」처럼 단추 이름이 된다 */
  const [work, setWork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDrafts((await api<{ drafts: DraftSummary[] }>(`/api/survey-drafts?cpo=${cpo}`)).drafts);
    } catch {
      // 목록을 못 받아도 쓰는 일은 막지 않는다
    }
  }, [cpo]);
  useEffect(() => { void refresh(); }, [refresh]);

  const dirty = value !== base.current;
  useLeaveGuard(dirty || busy || work !== null, LEAVE_MESSAGE);

  const save = useCallback(async () => {
    setError(null);
    const snapshot = value;
    try {
      setWork('저장 준비 중…');
      let draftId = id;
      if (!draftId) {
        draftId = (await api<{ id: string }>('/api/survey-drafts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpo, title }),
        })).id;
        setId(draftId);
      }
      const todo = filesOf(snapshot).filter((f) => !uploaded.has(f));
      for (const [i, f] of todo.entries()) {
        setWork(`사진 올리는 중 ${i + 1}/${todo.length}`);
        uploaded.set(f, await uploadPhoto(draftId, f as File));
      }
      setWork('저장 중…');
      const data = swap(snapshot, (x) => (x instanceof Blob ? uploaded.get(x) : undefined));
      await api(`/api/survey-drafts/${draftId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, data }),
      });
      base.current = snapshot;
      setSavedAt(Date.now());
      void refresh();
    } catch (err) {
      setError(`임시 저장하지 못했습니다 — ${(err as Error)?.message || '다시 해 주세요'}`);
    } finally {
      setWork(null);
    }
  }, [value, id, cpo, title, refresh]);

  const restore = useCallback(async (draftId: string) => {
    setError(null);
    try {
      setWork('불러오는 중…');
      const { draft } = await api<{ draft: DraftFull }>(`/api/survey-drafts/${draftId}`);
      const refs: PhotoRef[] = [];
      swap(draft.data, (x) => {
        if (x && typeof x === 'object' && (x as PhotoRef).__photo) { refs.push(x as PhotoRef); return x; }
        return undefined;
      });
      const files = new Map<string, File>();
      for (const [i, r] of refs.entries()) {
        setWork(`사진 받는 중 ${i + 1}/${refs.length}`);
        const res = await fetch(r.url);
        if (!res.ok) throw new Error(`사진을 받지 못했습니다 (${r.name})`);
        const file = new File([await res.blob()], r.name, { type: r.type });
        uploaded.set(file, r);
        files.set(r.path, file);
      }
      const v = swap(draft.data, (x) =>
        x && typeof x === 'object' && (x as PhotoRef).__photo ? files.get((x as PhotoRef).path) ?? null : undefined
      ) as T;
      base.current = v;
      apply(v);
      setId(draft.id);
      setSavedAt(new Date(draft.updatedAt).getTime());
    } catch (err) {
      setError(`불러오지 못했습니다 — ${(err as Error)?.message || '다시 해 주세요'}`);
    } finally {
      setWork(null);
    }
  }, [apply]);

  const remove = useCallback(async (draftId: string) => {
    setError(null);
    try {
      await api(`/api/survey-drafts/${draftId}`, { method: 'DELETE' });
      if (draftId === id) { setId(null); setSavedAt(null); }
      await refresh();
    } catch (err) {
      setError(`지우지 못했습니다 — ${(err as Error)?.message || '다시 해 주세요'}`);
    }
  }, [id, refresh]);

  return { id, drafts, save, restore, remove, work, savedAt, dirty, error };
}

/** 「10/01 21:30」 */
export const stamp = (t: number | string) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
