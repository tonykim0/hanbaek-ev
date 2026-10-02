'use client';

/**
 * 사진에서 전력인입점 글자 읽기 — 화면 쪽 (한백 지시 2026-10-01 「사진 넣으면 판넬명·전주번호 자동 입력」).
 *
 * 사진을 칸에 넣는 순간 줄여서(긴 변 1600px) 서버에 보내 읽는다(app/api/survey/read-plate). 돌아오면
 * ★칸이 비었거나 전에 사진에서 읽어 넣은 값 그대로일 때만★ 채운다 — 읽는 7~8초 사이에 사람이 적었으면 사람
 * 것이 이긴다. 못 읽거나 실패하면 조용히 둔다(칸은 원래 손으로 적는 자리다).
 *
 * 어느 사진이 어느 칸을 채우나는 서식마다 다르다 — 화면이 정한다(SurveyEditor PLATE · PluglinkEditor).
 */
import { useCallback, useRef, useState } from 'react';
import { prepareImage } from './prepare-image';

/** 사진에서 읽은 것 — 못 읽은 것은 null(지어내지 않는다, lib/survey/read-plate) */
export interface PlateRead {
  /** 분전반(판넬) 이름 — 「PM-101」「LE-117」「L-CAR」「LV-5 ATS」 */
  panel: string | null;
  /** 한전 전주번호 — 「2175G142 송정선 49R3」(전산화번호 + 선로명·번호) */
  pole: string | null;
  /** 메인차단기 — 「225A」「4P 150A」. 외함 안 차단기에 또렷이 보일 때만 */
  breaker: string | null;
}

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
 * 사진 읽기와 「읽는 중·읽음」 표시.
 *
 *   photoTag  「거점id:사진칸」 — 한 사진 자리. 같은 자리에 새 사진이 들어오면 앞 읽기의 결과는 버린다
 *             (읽는 7~8초 사이에 바꾼 사진의 글자가 들어오던 것).
 *   fieldTag  「거점id:값칸」 — 칸 이름 옆에 「사진에서 읽는 중…」「사진에서 읽음」이 붙는다. 사진 둘이 한 칸을
 *             채우기도 한다(SK 전력인입점 사진 1·2 → 판넬 칸) — 둘 다 끝나야 「읽는 중」이 걷힌다.
 *
 * apply 는 결과로 상태를 고치고 ★채운 칸과 값★을 돌려준다. 채울지는 apply 가 최신 상태로 정한다 —
 * canFill(fieldTag, 지금 값): 칸이 비었거나, 전에 사진에서 읽어 넣은 값 그대로일 때만(사람이 적은 것은 덮지 않는다,
 * 사진을 바꿨으면 새 사진의 글자로 바꾼다).
 */
export function usePlateReader() {
  const [state, setState] = useState<Record<string, { n: number; done: boolean }>>({});
  const token = useRef(new Map<string, number>());
  const auto = useRef(new Map<string, string>());

  const bump = (tags: string[], d: number, filled: string[] = []) => setState((s) => {
    const next = { ...s };
    for (const t of tags) {
      const cur = next[t] ?? { n: 0, done: false };
      const v = { n: Math.max(0, cur.n + d), done: cur.done || filled.includes(t) };
      if (v.n === 0 && !v.done) delete next[t]; else next[t] = v;
    }
    return next;
  });

  const read = useCallback((photoTag: string, fieldTags: string[], file: File, apply: (r: PlateRead) => Record<string, string> | null) => {
    const mine = (token.current.get(photoTag) ?? 0) + 1;
    token.current.set(photoTag, mine);
    bump(fieldTags, +1);
    void readPlateOf(file).then((r) => {
      const live = token.current.get(photoTag) === mine;
      const filled = live && r ? apply(r) ?? {} : {};
      for (const [t, v] of Object.entries(filled)) auto.current.set(t, v);
      bump(fieldTags, -1, Object.keys(filled));
    });
  }, []);
  const canFill = useCallback((fieldTag: string, now: string | undefined) => !now?.trim() || auto.current.get(fieldTag) === now, []);
  /** 사람이 칸을 고치면 「사진에서 읽음」을 걷는다 — 그 값은 이제 사람 것이다 */
  const clear = useCallback((fieldTag: string) => {
    auto.current.delete(fieldTag);
    setState((s) => {
      if (!s[fieldTag]?.done) return s;
      const next = { ...s };
      if (next[fieldTag].n > 0) next[fieldTag] = { ...next[fieldTag], done: false }; else delete next[fieldTag];
      return next;
    });
  }, []);
  const note = (fieldTag: string) => (state[fieldTag]?.n ? ' · 사진에서 읽는 중…' : state[fieldTag]?.done ? ' · 사진에서 읽음' : '');
  return { read, canFill, clear, note };
}

/** 새로 들어온 사진 — 칸 key 가 같은데 파일이 바뀐 것 */
export function newPhotos(before: Record<string, File | null | undefined>, after: Record<string, File | null | undefined>, keys: string[]): Array<[string, File]> {
  return keys.flatMap((k) => (after[k] && after[k] !== before[k] ? [[k, after[k] as File] as [string, File]] : []));
}
