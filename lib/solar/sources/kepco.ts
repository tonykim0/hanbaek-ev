import type { GridLayer, GridRow } from '../types';
import { getJson, qs, SourceError } from './http';

/**
 * 한전 전력데이터 개방포털 OPEN API 「분산전원연계 정보」.
 * 입력은 PNU 가 아니라 법정동 시도·시군구 코드 + 읍면동·리 이름 + 지번이다.
 * vol1 변전소 · vol2 변압기 · vol3 배전선로(DL) 여유용량, 단위 kW — 실값으로 확인했다
 * (천안 장재 #1 광덕: 177,185 · 35,820 · 12,975 — SolarCheck 가 같은 값을 kW 로 보인다).
 * substPwr · mtrPwr · dlPwr 는 「누적 연계용량」(SolarCheck 의 「접수」)이고 여유와 더하면 한도가 된다 —
 * 천안 둘레 15줄에서 변전소 150,000·200,000 · 변압기 50,000 · 선로 12,000·13,000 으로 맞아떨어졌다.
 * 문서의 「용량」 칸(jsSubstPwr · jsMtrPwr · jsDlPwr)은 늘 0 이라 안 쓴다.
 * 그 번지에 기록이 없으면 HTTP 404 「NotFound」다(고장이 아니다).
 */
type Raw = {
  substNm?: string;
  mtrNo?: string | number;
  dlNm?: string;
  substPwr?: string | number;
  mtrPwr?: string | number;
  dlPwr?: string | number;
  vol1?: string | number;
  vol2?: string | number;
  vol3?: string | number;
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** 여유가 0 이면 접수가 한도를 넘어 있을 수 있다(풍세 #2 보성 선로 13,863kW) — 그때 한도는 모른다 */
function layerOf(accepted: unknown, spare: unknown): GridLayer {
  const acceptedKw = num(accepted);
  const spareKw = num(spare);
  return { spareKw, acceptedKw, limitKw: acceptedKw !== null && spareKw !== null && spareKw > 0 ? acceptedKw + spareKw : null };
}

export function rowsOf(body: unknown): GridRow[] {
  const data = (body as { data?: Raw[] })?.data;
  if (!Array.isArray(data)) return [];
  return data.map((r) => {
    const layers = {
      substation: layerOf(r.substPwr, r.vol1),
      transformer: layerOf(r.mtrPwr, r.vol2),
      feeder: layerOf(r.dlPwr, r.vol3),
    };
    const known = Object.values(layers).flatMap((l) => (l.spareKw === null ? [] : [l.spareKw]));
    return {
      substation: r.substNm ?? '',
      transformer: r.mtrNo === undefined || r.mtrNo === null || r.mtrNo === '' ? null : String(r.mtrNo),
      feeder: r.dlNm ?? '',
      spareKw: known.length === 3 ? Math.min(...known) : null,
      layers,
    };
  });
}

/**
 * 전남광주통합특별시(12) 시군구 → 옛 광주(29)·전남(46) 코드. 한전 공통코드 API(lglDngCityCd)의 두 목록을
 * 이름으로 맞춰 만들었다(2026-11-03). 광양만 번호가 바뀌었다(12190 → 46230).
 */
const JEONNAM_GWANGJU: Record<string, string> = {
  '110': '46110', // 목포시
  '130': '46130', // 여수시
  '150': '46150', // 순천시
  '170': '46170', // 나주시
  '190': '46230', // 광양시
  '210': '29110', // 동구
  '240': '29140', // 서구
  '270': '29155', // 남구
  '300': '29170', // 북구
  '330': '29200', // 광산구
  '710': '46710', // 담양군
  '720': '46720', // 곡성군
  '730': '46730', // 구례군
  '740': '46770', // 고흥군
  '750': '46780', // 보성군
  '760': '46790', // 화순군
  '770': '46800', // 장흥군
  '780': '46810', // 강진군
  '790': '46820', // 해남군
  '800': '46830', // 영암군
  '810': '46840', // 무안군
  '820': '46860', // 함평군
  '830': '46870', // 영광군
  '840': '46880', // 장성군
  '850': '46890', // 완도군
  '860': '46900', // 진도군
  '870': '46910', // 신안군
};

export type Codes = { sido: string; sigungu: string };

/**
 * 새로 생긴 구 → 한전 자료가 있는 옛 시군구(2026-11-03 실측). 공통코드 목록에는 새 코드가 있는데 자료는 옛 코드로만 나온다.
 * 화성시 4구(만세·효행·병점·동탄): 41/590 서신면 15줄 · 봉담읍 31줄 · 병점동 5줄, 새 코드로는 404·401.
 * 인천 제물포구·영종구: 28/110(옛 중구) 운서동 11줄.
 */
const NEW_DISTRICT: Record<string, string[]> = {
  '41591': ['41590'],
  '41593': ['41590'],
  '41595': ['41590'],
  '41597': ['41590'],
  '28125': ['28110', '28140'],
  '28155': ['28110'],
};

/** 특별·광역시와 세종 — 구 코드 끝자리가 0 이 아니어도(28177 미추홀구) 위에 「시」 코드가 따로 없다 */
const METRO = new Set(['11', '26', '27', '28', '29', '30', '31', '36']);

/**
 * 물어볼 코드 차례 — 자료가 옛 코드에만 있는 곳은 옛 코드 먼저, 그다음 지금 코드, 마지막으로 일반시의 「시」 코드.
 * 실측(2026-11-03): 나주 남평읍 12/170 → 404 · 46/170 → 7줄, 전주 서신동 52/111 → 401 · 45/111 → 6줄,
 * 부천 심곡본동 41/194(소사구) → 401 · 41/190(부천시) → 9줄.
 */
export function kepcoCodes(sido: string, sigungu: string): Codes[] {
  const list: Codes[] = [];
  const add = (code5: string) => {
    if (!list.some((c) => c.sido + c.sigungu === code5)) list.push({ sido: code5.slice(0, 2), sigungu: code5.slice(2) });
  };
  if (sido === '12' && JEONNAM_GWANGJU[sigungu]) add(JEONNAM_GWANGJU[sigungu]);
  if (sido === '52') add(`45${sigungu}`);
  for (const old of NEW_DISTRICT[sido + sigungu] ?? []) add(old);
  add(sido + sigungu);
  for (const c of [...list]) if (!METRO.has(c.sido) && !c.sigungu.endsWith('0')) add(`${c.sido}${c.sigungu.slice(0, 2)}0`);
  return list;
}

/** 「이 코드로는 기록 없음」 — 다음 코드로 넘어간다 */
const noRecord = (err: unknown) => err instanceof SourceError && (err.status === 404 || err.status === 401);

/** 빈 응답(200 인데 본문 없음) — 한전이 몰린 요청을 이렇게 돌려준다. 잠깐 쉬고 한 번 더 */
const emptyBody = (err: unknown) => err instanceof SourceError && err.status === undefined && /JSON 아님: $/.test(err.message);

async function getOnce(url: string): Promise<unknown> {
  try {
    return await getJson('한전', url);
  } catch (err) {
    if (!emptyBody(err)) throw err;
    await new Promise((r) => setTimeout(r, 400));
    return getJson('한전', url);
  }
}

export type Where = {
  dong: string | null;
  ri: string | null;
  /** 비우면 그 읍면동(리) 전체의 선로 */
  jibun: string | null;
};

/**
 * 코드를 차례로 물어 처음 나온 자료와 그 코드 — 기록이 없으면 빈 목록(고장이면 던진다).
 * 코드를 돌려주는 것은 둘레 필지를 그 코드 하나로만 묻게 하려고다(빈 번지마다 코드를 다 돌면 요청이 몇 배로 는다).
 */
export async function gridRowsIn(codes: Codes[], where: Where): Promise<{ rows: GridRow[]; code: Codes | null }> {
  const key = process.env.KEPCO_KEY;
  if (!key) throw new Error('[한전] KEPCO_KEY 없음');
  for (const c of codes) {
    const url = `https://bigdata.kepco.co.kr/openapi/v1/dispersedGeneration.do?${qs({
      metroCd: c.sido,
      cityCd: c.sigungu,
      addrLidong: where.dong,
      addrLi: where.ri,
      addrJibun: where.jibun,
      apiKey: key,
      returnType: 'json',
    })}`;
    try {
      const rows = rowsOf(await getOnce(url));
      if (rows.length) return { rows, code: c };
    } catch (err) {
      if (!noRecord(err)) throw err;
    }
  }
  return { rows: [], code: null };
}
