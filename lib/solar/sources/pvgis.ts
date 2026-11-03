import { PV_LOSS_PCT, TILT_DEG } from '../assumptions';
import type { Mode } from '../types';
import { getJson, qs } from './http';

/**
 * PVGIS (유럽연합 JRC) — 1kW 당 연 발전량(kWh). 키 없음 · IP 당 초당 30회.
 * 한국은 ERA5 자료만 덮는다(SARAH3 는 범위 밖이라 거절).
 */
export async function kwhPerKwYear(lat: number, lng: number, mode: Mode): Promise<number> {
  const url = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${qs({
    lat: lat.toFixed(5),
    lon: lng.toFixed(5),
    peakpower: 1,
    loss: PV_LOSS_PCT,
    angle: TILT_DEG[mode],
    aspect: 0,
    raddatabase: 'PVGIS-ERA5',
    outputformat: 'json',
  })}`;
  const body = await getJson<{ outputs?: { totals?: { fixed?: { E_y?: number } } } }>('PVGIS', url, 15_000);
  const ey = body.outputs?.totals?.fixed?.E_y;
  if (typeof ey !== 'number' || !(ey > 0)) throw new Error('[PVGIS] 연 발전량(E_y) 없음');
  return ey;
}
