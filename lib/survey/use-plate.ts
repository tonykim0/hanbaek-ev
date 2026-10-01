'use client';

/**
 * 사진에서 전력인입점 글자 읽기 — 화면 쪽 (한백 지시 2026-10-01 「사진 넣으면 판넬명·전주번호 자동 입력」).
 *
 * 사진을 칸에 넣는 순간 줄여서(긴 변 1600px) 서버에 보내 읽는다(app/api/survey/read-plate). 돌아오면
 * ★그 칸이 아직 비어 있을 때만★ 채운다 — 읽는 7~8초 사이에 사람이 적었으면 사람 것이 이긴다.
 * 못 읽거나 실패하면 조용히 둔다(칸은 원래 손으로 적는 자리다).
 *
 * 어느 사진이 어느 칸을 채우나는 서식마다 다르다 — PLATE_SLOTS 가 정본이다.
 */
import { useCallback, useState } from 'react';
import { prepareImage } from './prepare-image';

export interface PlateRead { panel: string | null; pole: string | null; breaker: string | null }

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function readPlateOf(file: File): Promise<PlateRead | null> {
  try {
    const img = await prepareImage(file);
    const res = await fetch('/api/survey/read-plate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64(img.bytes), mediaType: 'image/jpeg' }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlateRead;
  } catch {
    return null;
  }
}

/**
 * 읽는 중·읽음 표시 — 「거점id:칸」 마다. 칸 이름 옆에 「사진에서 읽는 중…」「사진에서 읽음」이 붙는다.
 * read(…) 는 사진을 읽고, apply 가 그 결과로 상태를 고친다(빈 칸 판정은 apply 가 최신 상태로 한다).
 */
export function usePlateReader() {
  const [state, setState] = useState<Record<string, 'reading' | 'done'>>({});
  const read = useCallback((tag: string, file: File, apply: (r: PlateRead) => boolean) => {
    setState((s) => ({ ...s, [tag]: 'reading' }));
    void readPlateOf(file).then((r) => {
      const filled = r ? apply(r) : false;
      setState((s) => {
        const next = { ...s };
        if (filled) next[tag] = 'done'; else delete next[tag];
        return next;
      });
    });
  }, []);
  /** 사람이 칸을 고치면 「사진에서 읽음」을 걷는다 — 그 값은 이제 사람 것이다 */
  const clear = useCallback((tag: string) => setState((s) => {
    if (!(tag in s)) return s;
    const next = { ...s }; delete next[tag]; return next;
  }), []);
  const note = (tag: string) => (state[tag] === 'reading' ? ' · 사진에서 읽는 중…' : state[tag] === 'done' ? ' · 사진에서 읽음' : '');
  return { read, clear, note };
}

/** 새로 들어온 사진 — 칸 key 가 같은데 파일이 바뀐 것 */
export function newPhotos(before: Record<string, File | null | undefined>, after: Record<string, File | null | undefined>, keys: string[]): Array<[string, File]> {
  return keys.flatMap((k) => (after[k] && after[k] !== before[k] ? [[k, after[k] as File] as [string, File]] : []));
}
