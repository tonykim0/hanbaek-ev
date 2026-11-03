/**
 * 필지 고유번호(PNU) 19자리 = 법정동코드 10 + 필지구분 1(1 일반 · 2 산) + 본번 4 + 부번 4.
 * 법정동코드 앞 2자리 = 시도, 다음 3자리 = 시군구 — 한전 분산전원 API 의 metroCd·cityCd 가 이것과 같다
 * (문서 예: metroCd 44 충남 · cityCd 131 천안시 동남구 = 법정동 44131).
 */
export type PnuParts = {
  sido: string;
  sigungu: string;
  /** 시군구코드 5자리(시도 포함) */
  sigunguCd: string;
  bjdongCd: string;
  mountain: boolean;
  bun: number;
  ji: number;
};

export function parsePnu(pnu: string | null | undefined): PnuParts | null {
  if (!pnu || !/^\d{19}$/.test(pnu)) return null;
  return {
    sido: pnu.slice(0, 2),
    sigungu: pnu.slice(2, 5),
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    mountain: pnu[10] === '2',
    bun: Number(pnu.slice(11, 15)),
    ji: Number(pnu.slice(15, 19)),
  };
}

/** 지번 표기 「142-1」 · 부번이 없으면 「142」 · 산이면 「산 142-1」 */
export function jibunOf(p: PnuParts): string {
  return `${p.mountain ? '산 ' : ''}${p.bun}${p.ji ? `-${p.ji}` : ''}`;
}

/**
 * 지번 주소에서 읍면동·리 이름을 꺼낸다 — 한전 API 는 읍면동을 코드가 아니라 이름으로 받는다.
 * 「충청남도 천안시 동남구 광덕면 광덕리 142-1」 → { dong: '광덕면', ri: '광덕리' }
 */
export function dongRiOf(jibunAddress: string | null | undefined): { dong: string | null; ri: string | null } {
  if (!jibunAddress) return { dong: null, ri: null };
  const words = jibunAddress.split(/\s+/);
  const dong = words.find((w) => /(읍|면|동|가)$/.test(w) && !/(시|군|구)$/.test(w)) ?? null;
  const ri = words.find((w) => /리$/.test(w)) ?? null;
  return { dong, ri };
}
