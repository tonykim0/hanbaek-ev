import type { RegisterBuilding } from '../building-register';
import { roofLabel } from '../building-register';
import type { PnuParts } from '../pnu';
import { getJson, qs, SourceError } from './http';

/**
 * 공공데이터포털 국토교통부 건축HUB 건축물대장정보 — 표제부(동마다 한 줄).
 * 키는 data.go.kr 「일반 인증키」. 포털이 주는 두 모양(Encoding · Decoding) 중 어느 것을 넣어도 되게
 * %가 섞였으면 한 번 풀어서 쓴다(그대로 쓰면 두 번 인코딩돼 「등록되지 않은 키」가 된다).
 */
const BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService';

export const hasRegisterKey = () => Boolean(process.env.DATA_GO_KR_KEY);

function serviceKey(): string | null {
  const k = process.env.DATA_GO_KR_KEY?.trim();
  if (!k) return null;
  return k.includes('%') ? decodeURIComponent(k) : k;
}

type Item = {
  dongNm?: string;
  mainAtchGbCdNm?: string;
  archArea?: string | number;
  strctCdNm?: string;
  etcStrct?: string;
  roofCdNm?: string;
  etcRoof?: string;
  heit?: string | number;
  mainPurpsCdNm?: string;
  etcPurps?: string;
  useAprDay?: string | number;
};

type Body = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: Item | Item[] } | string; totalCount?: number | string };
  };
};

const text = (v: unknown) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const number = (v: unknown) => {
  const t = text(v);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const pad4 = (n: number) => String(n).padStart(4, '0');

export function buildingsOf(items: Item[]): RegisterBuilding[] {
  return items.map((it) => ({
    dong: text(it.dongNm),
    main: text(it.mainAtchGbCdNm) !== '부속건축물',
    archArea: number(it.archArea),
    structure: text(it.strctCdNm) ?? text(it.etcStrct),
    roof: roofLabel(text(it.roofCdNm), text(it.etcRoof)),
    height: number(it.heit),
    use: text(it.mainPurpsCdNm) ?? text(it.etcPurps),
    useApr: text(it.useAprDay),
  }));
}

/**
 * 그 지번을 대지위치로 등록된 건물 전부. 키가 없으면 null — 부르는 쪽이 VWorld 도형으로 돌아간다.
 * 여러 필지에 걸친 공장은 대표 지번 하나에 동이 다 걸린다(동성제약 아산공장: 관대리 36 에 14동).
 */
export async function registerTitles(p: PnuParts): Promise<RegisterBuilding[] | null> {
  const key = serviceKey();
  if (!key) return null;
  const items: Item[] = [];
  for (let page = 1; page <= 5; page++) {
    const url = `${BASE}/getBrTitleInfo?${qs({
      serviceKey: key,
      sigunguCd: p.sigunguCd,
      bjdongCd: p.bjdongCd,
      platGbCd: p.mountain ? '1' : '0',
      bun: pad4(p.bun),
      ji: pad4(p.ji),
      numOfRows: 100,
      pageNo: page,
      _type: 'json',
    })}`;
    const body = await getJson<Body>('건축물대장', url);
    const header = body.response?.header;
    if (header?.resultCode && header.resultCode !== '00')
      throw new SourceError('건축물대장', `${header.resultCode} ${header.resultMsg ?? ''}`.trim());
    const raw = body.response?.body?.items;
    const got = typeof raw === 'object' && raw?.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
    items.push(...got);
    const total = Number(body.response?.body?.totalCount ?? 0);
    if (got.length < 100 || items.length >= total) break;
  }
  return buildingsOf(items);
}
