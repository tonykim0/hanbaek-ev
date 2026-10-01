'use client';

/**
 * 실사보고서 임시 저장 — 사진까지 통째로, 이 브라우저 안에(IndexedDB). (한백 지시 2026-10-01)
 *
 * ★서버에 올리지 않는다★ — 실사보고서 작성은 서버에 아무것도 저장하지 않는 도구다(components/survey).
 * 임시 저장도 그 약속을 지킨다: 같은 컴퓨터·같은 브라우저에서만 다시 연다. IndexedDB 는 사진(File)을
 * 그대로 담는다(localStorage 는 글자만, 5MB 남짓이라 사진을 못 담는다).
 *
 * ★저장한 뒤에 바꾼 것이 있으면 나갈 때 묻는다★ — 「실사보고서 작성을 중단하시겠습니까?」. 사이드바의
 * 다른 메뉴를 누르면 이 화면이 사라지고 넣은 것이 초기화된다(콘솔 안 이동은 창을 닫는 것이 아니라
 * 브라우저가 묻지 않는다 — lib/use-leave-guard 가 링크 클릭을 가로챈다). 저장한 그대로면 묻지 않는다.
 *
 * 저장본은 운영사(서식)마다 하나다 — 같은 서식으로 두 현장을 번갈아 쓰면 나중 것이 덮는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeaveGuard } from '@/lib/use-leave-guard';

const DB = 'hanbaek-survey';
const STORE = 'drafts';

interface Saved<T> { savedAt: number; data: T }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<R>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> {
  const db = await open();
  try {
    return await new Promise<R>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('저장이 취소되었습니다'));
    });
  } finally {
    db.close();
  }
}

const read = <T,>(key: string) => run<Saved<T> | undefined>('readonly', (s) => s.get(key));
const write = <T,>(key: string, v: Saved<T>) => run('readwrite', (s) => s.put(v, key));
const drop = (key: string) => run('readwrite', (s) => s.delete(key));

export const LEAVE_MESSAGE = '실사보고서 작성을 중단하시겠습니까? 임시 저장하지 않은 내용은 초기화됩니다.';

/**
 * @param key   저장 자리 — 「survey:pluglink」
 * @param value 지금 화면의 값(사진 포함). 바뀔 때마다 새 객체여야 한다(React 상태 그대로)
 * @param apply 저장본을 화면에 되살린다
 * @param busy  만드는 중 — 그동안 나가도 묻는다
 */
export function useSurveyDraft<T>(key: string, value: T, apply: (v: T) => void, busy = false) {
  /** 마지막으로 저장(또는 불러온) 값 — 이것과 다르면 「바뀐 것이 있다」 */
  const base = useRef<T>(value);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** 이 화면을 열 때 남아 있던 저장본 — 불러오기·버리기를 고를 때까지 띠로 보인다 */
  const [found, setFound] = useState<Saved<T> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    read<T>(key).then((s) => { if (live && s) setFound(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [key]);

  const dirty = value !== base.current;
  useLeaveGuard(dirty || busy, LEAVE_MESSAGE);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const at = Date.now();
      await write(key, { savedAt: at, data: value });
      base.current = value;
      setSavedAt(at);
      setFound(null);
    } catch (err) {
      setError(`임시 저장하지 못했습니다 — ${(err as Error)?.message || '브라우저 저장 공간을 확인해 주세요'}`);
    } finally {
      setSaving(false);
    }
  }, [key, value]);

  const restore = useCallback(() => {
    if (!found) return;
    base.current = found.data;
    apply(found.data);
    setSavedAt(found.savedAt);
    setFound(null);
  }, [found, apply]);

  const discard = useCallback(async () => {
    await drop(key).catch(() => undefined);
    setFound(null);
  }, [key]);

  return { save, saving, savedAt, dirty, found, restore, discard, error };
}

/** 「10/01 21:30」 */
export const stamp = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
