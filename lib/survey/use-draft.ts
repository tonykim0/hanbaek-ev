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
import {
  DRAFT_CONFLICT, DRAFT_NOT_FOUND, isPhotoRef, photoRefsOf, type DraftCpo, type DraftFull, type DraftSummary, type PhotoRef,
} from './draft-shape';
import { canvasOf } from './prepare-image';

export const LEAVE_MESSAGE = '실사보고서 작성을 중단하시겠습니까? 임시 저장하지 않은 내용은 초기화됩니다.';

/**
 * 이 화면에서 올렸거나 내려받은 사진 → 그 자리. 같은 사진을 두 번 올리지 않는다. ★그 자리가 지금 저장본의
 * 폴더일 때만 쓴다★(inFolder) — 저장본을 지우고 새로 저장하면 옛 폴더의 자리를 실어 보내 서버가 「이 저장본의
 * 사진이 아닙니다」로 매번 거절했다.
 */
const uploaded = new WeakMap<Blob, PhotoRef>();
const inFolder = (r: PhotoRef | undefined, draftId: string): r is PhotoRef => !!r && r.path.includes(`/${draftId}/`);

/** 값 속 사진(File)들 — 순서대로, 겹치지 않게 */
function filesOf(v: unknown, out = new Set<Blob>()): Blob[] {
  if (v instanceof Blob) out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => filesOf(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => filesOf(x, out));
  return [...out];
}

/** 사진(File) → 자리로 바꾼 값 — 저장할 때. 되돌리는 쪽은 draft-shape 의 mapPhotoRefs 다 */
function toRefs(v: unknown, ref: (b: Blob) => PhotoRef): unknown {
  if (v instanceof Blob) return ref(v);
  if (Array.isArray(v)) return v.map((x) => toRefs(x, ref));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toRefs(x, ref)]));
  return v;
}

/** 올릴 꼴 — 바로 세우고 긴 변 2400px JPEG. 못 여는 사진(HEIC 등)은 그대로 */
async function shrink(file: File): Promise<Blob> {
  try {
    const c = await canvasOf(file, 2400);
    return (await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9))) ?? file;
  } catch {
    return file;
  }
}

/**
 * 차례로 하되 넷씩 같이 — 사진 수십 장 저장본을 올리고 받는 시간이 줄어든다.
 * ★하나가 실패하면 새 일은 집지 않고, 하던 일이 다 끝난 뒤에 실패를 던진다★ — 먼저 던지면 남은 일꾼이 뒤에서
 * 계속 돌며 「올리는 중」을 다시 써 단추가 멈춘 채 남았고, 지우기(새 저장본 되돌리기)와 올리기가 엇갈렸다.
 */
async function pool<T>(items: T[], run: (x: T) => Promise<void>, size = 4): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  await Promise.allSettled(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (failed === null && next < items.length) {
      const x = items[next++];
      try { await run(x); } catch (e) { failed ??= e; }
    }
  }));
  if (failed !== null) throw failed;
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
 * @param apply 저장본을 화면에 되살린다 — 고쳐서(빠진 칸을 기본값으로) 세웠으면 세운 값을 돌려준다. 그 값이
 *              「저장한 그대로」의 기준이 된다(안 돌려주면 받은 값 — 그러면 고친 화면이 늘 「바뀐 것 있음」이다)
 * @param title 저장본 이름 — 현장명
 * @param busy  만드는 중 — 그동안 나가도 묻는다
 */
export function useSurveyDraft<T>(cpo: DraftCpo, value: T, apply: (v: T) => T | void, title: string, busy = false) {
  /** 마지막으로 저장(또는 불러온) 값 — 이것과 다르면 「바뀐 것이 있다」 */
  const base = useRef<T>(value);
  /** 마지막으로 불러오거나 저장한 판(updatedAt) — 저장할 때 같이 보내 다른 창·기기의 저장을 덮지 않는다 */
  const version = useRef<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  /** 열람 전용은 저장하지 못한다 — 목록이 알려준다 */
  const [canSave, setCanSave] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  /** 도는 일 — 「사진 올리는 중 3/12」처럼 단추 이름이 된다 */
  const [work, setWork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * 지금 저장본에 저장할 수 없다 — 다른 창·기기가 먼저 저장했거나(판이 다르다) 저장본이 지워졌다. 응답을 못 받은
   * 저장 뒤에도 판이 어긋나 여기로 온다. 화면이 「새 저장본으로 저장」과 이 저장본의 「불러오기」를 연다.
   */
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ drafts: DraftSummary[]; canSave?: boolean }>(`/api/survey-drafts?cpo=${cpo}`);
      setDrafts(r.drafts);
      setCanSave(r.canSave !== false);
    } catch {
      // 목록을 못 받아도 쓰는 일은 막지 않는다
    }
  }, [cpo]);
  useEffect(() => { void refresh(); }, [refresh]);

  const dirty = value !== base.current;
  useLeaveGuard(dirty || busy || work !== null, LEAVE_MESSAGE);

  const save = useCallback(async (asNew = false) => {
    setError(null);
    const snapshot = value;
    /* 새로 만든 저장본이 값을 받기 전에 실패하면 지운다 — 빈 줄이 목록에 남아 열면 화면이 깨졌다 */
    let created: string | null = null;
    try {
      setWork('저장 준비 중…');
      let draftId = asNew ? null : id;
      if (!draftId) {
        draftId = created = (await api<{ id: string }>('/api/survey-drafts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpo, title }),
        })).id;
        version.current = null;
      }
      const folder = draftId;
      const todo = filesOf(snapshot).filter((f) => !inFolder(uploaded.get(f), folder));
      let done = 0;
      await pool(todo, async (f) => {
        uploaded.set(f, await uploadPhoto(folder, f as File));
        setWork(`사진 올리는 중 ${(done += 1)}/${todo.length}`);
      });
      setWork('저장 중…');
      const data = toRefs(snapshot, (b) => uploaded.get(b)!);
      const { savedAt: at } = await api<{ savedAt: string }>(`/api/survey-drafts/${draftId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, data, base: version.current ?? undefined }),
      });
      created = null;
      version.current = at;
      setStale(false);
      setId(draftId);
      base.current = snapshot;
      setSavedAt(new Date(at).getTime());
      void refresh();
    } catch (err) {
      if (created) void fetch(`/api/survey-drafts/${created}`, { method: 'DELETE' }).catch(() => undefined);
      const msg = (err as Error)?.message;
      if (msg === DRAFT_CONFLICT || msg === DRAFT_NOT_FOUND) setStale(true);
      setError(`임시 저장하지 못했습니다 — ${msg || '다시 해 주세요'}`);
    } finally {
      setWork(null);
    }
  }, [value, id, cpo, title, refresh]);

  const restore = useCallback(async (draftId: string) => {
    setError(null);
    try {
      setWork('불러오는 중…');
      const { draft } = await api<{ draft: DraftFull }>(`/api/survey-drafts/${draftId}`);
      if (!draft.data || typeof draft.data !== 'object' || Object.keys(draft.data).length === 0) {
        throw new Error('값이 없는 저장본입니다(저장하다 끊긴 것) — 지워 주세요');
      }
      const refs = photoRefsOf(draft.data);
      const files = new Map<string, File>();
      /* 못 받은 사진은 빈 칸으로 열고 알린다 — 한 장 때문에 저장본 전체가 안 열리면 안 된다. 한 번 더 받아 본다 */
      const missed: string[] = [];
      let done = 0;
      await pool(refs, async (r) => {
        const res = await fetch(r.url).then((x) => (x.ok ? x : fetch(r.url))).catch(() => null);
        if (!res?.ok) { missed.push(r.name); return; }
        const file = new File([await res.blob()], r.name, { type: r.type });
        uploaded.set(file, r);
        files.set(r.path, file);
        setWork(`사진 받는 중 ${(done += 1)}/${refs.length}`);
      });
      const v = toFiles(draft.data, files) as T;
      base.current = apply(v) ?? v;
      version.current = draft.updatedAt;
      setStale(false);
      setId(draft.id);
      setSavedAt(new Date(draft.updatedAt).getTime());
      if (missed.length) {
        setError(`사진 ${missed.length}장을 받지 못해 빈 칸으로 열었습니다(${missed.slice(0, 3).join(', ')}${missed.length > 3 ? ' …' : ''}) — 다시 불러오면 받을 수 있고, 이대로 저장하면 그 사진은 빠집니다`);
      }
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
      if (draftId === id) { setId(null); setSavedAt(null); setStale(false); version.current = null; }
      await refresh();
    } catch (err) {
      setError(`지우지 못했습니다 — ${(err as Error)?.message || '다시 해 주세요'}`);
    }
  }, [id, refresh]);

  return { id, drafts, save, restore, remove, work, savedAt, dirty, error, canSave, stale };
}

/** 자리 → 내려받은 사진(File). 못 받은 자리는 빈 칸(null) */
function toFiles(v: unknown, files: Map<string, File>): unknown {
  if (isPhotoRef(v)) return files.get(v.path) ?? null;
  if (Array.isArray(v)) return v.map((x) => toFiles(x, files));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFiles(x, files)]));
  return v;
}

/** 「10/01 21:30」 */
export const stamp = (t: number | string) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
