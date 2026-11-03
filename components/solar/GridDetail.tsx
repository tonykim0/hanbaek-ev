import { GRID_REFORM_NOTE } from '@/lib/solar/assumptions';
import { bottleneckOf, LAYER_NAME } from '@/lib/solar/rules';
import { GRID_LAYERS, type GridLayer, type GridLayerKey, type GridRow, type GridView } from '@/lib/solar/types';
import { Tag, Td, Th } from '@/components/ui';
import { TEXT } from './ui';

const kw = (v: number | null) => (v === null ? '—' : `${v.toLocaleString()}kW`);

/** 막대 옆 작은 글자 — 그 단계의 이름(변전소 이름 · 변압기 번호 · 선로 이름) */
function unitOf(row: GridRow, k: GridLayerKey): string {
  if (k === 'substation') return row.substation;
  if (k === 'transformer') return row.transformer ? `#${row.transformer}` : '—';
  return row.feeder;
}

/**
 * 계통 칸의 본문 — 판정 한 줄(위의 summary) 밑에 「어느 기록으로 봤나」와 세 단계 막대.
 * 한도 = 접수 + 여유. 막대의 회색은 이미 붙었거나 접수된 것, 주황은 이 땅의 예상 용량, 남은 초록이 여유다.
 */
export default function GridDetail({ grid, summary }: { grid: GridView; summary: string }) {
  const row = grid.best === null ? null : grid.rows[grid.best];
  const tight = row ? bottleneckOf(row) : null;
  const others = grid.rows.filter((_, i) => i !== grid.best);

  return (
    <div className="mt-3 space-y-3">
      <Basis grid={grid} />

      {row && (
        <div>
          <div className="space-y-2.5">
            {GRID_LAYERS.map((k) => (
              <LayerBar
                key={k}
                name={LAYER_NAME[k]}
                unit={unitOf(row, k)}
                layer={row.layers[k]}
                capacityKw={grid.capacityKw}
                tight={k === tight}
              />
            ))}
          </div>
          <Legend mine={grid.capacityKw !== null} />
        </div>
      )}

      {others.length > 0 && <OtherLines rows={others} dong={grid.basis.kind === 'dong'} />}

      {grid.region && grid.region !== summary && <p className={`${TEXT.body} font-semibold text-amber-800`}>{grid.region}</p>}
      <p className={TEXT.meta}>{GRID_REFORM_NOTE}</p>
    </div>
  );
}

function Basis({ grid }: { grid: GridView }) {
  const b = grid.basis;
  let text: string;
  if (b.kind === 'own') text = '이 번지의 한전 기록';
  else if (b.kind === 'neighbor')
    text = `이 번지는 한전 기록이 없어 ${b.distanceM < 1 ? '맞닿은' : `약 ${b.distanceM}m 떨어진`} 필지의 기록으로 봄 — ${b.address}`;
  else if (b.kind === 'dong') {
    const n = grid.rows.length;
    const k = grid.rows.filter((r) => r.spareKw !== null && r.spareKw >= Math.max(grid.capacityKw ?? 1, 1)).length;
    text =
      n === 1
        ? `이 번지·둘레 150m 에 한전 기록이 없어 ${b.dong}의 선로 하나로 봄`
        : `이 번지·둘레 150m 에 한전 기록이 없어 ${b.dong} 선로 ${n}개로 봄 — 예상 용량을 받을 여유 ${k}개 · 부족 ${n - k}개, 막대는 가장 여유 있는 선로`;
  }
  else return null;
  return (
    <p className={TEXT.body}>
      <span className="text-slate-500">기준</span> {text}
    </p>
  );
}

function LayerBar({
  name,
  unit,
  layer,
  capacityKw,
  tight,
}: {
  name: string;
  unit: string;
  layer: GridLayer;
  capacityKw: number | null;
  tight: boolean;
}) {
  const { spareKw, acceptedKw, limitKw } = layer;
  const full = spareKw !== null && spareKw <= 0;
  const share = (v: number) => (limitKw ? Math.min(100, (v / limitKw) * 100) : 0);
  const used = full ? 100 : acceptedKw !== null ? share(acceptedKw) : 0;
  // 예상 용량이 한도에 비해 아주 작아도(변전소 200,000kW 에 350kW) 보이게 한 줄은 칠한다
  const mine = !full && capacityKw && limitKw ? Math.min(Math.max(share(capacityKw), 0.8), 100 - used) : 0;

  return (
    <div className="grid grid-cols-[4.75rem_1fr] items-center gap-x-3">
      <div className="leading-tight">
        <span className={TEXT.item}>{name}</span>
        <span className={`block truncate ${TEXT.meta}`}>{unit}</span>
      </div>
      <div className="min-w-0">
        <div
          className={`flex h-2.5 overflow-hidden rounded-full ${spareKw === null ? 'bg-slate-100' : 'bg-brand-200'}`}
          role="img"
          aria-label={`${name} — 접수 ${kw(acceptedKw)}, 여유 ${kw(spareKw)}, 한도 ${kw(limitKw)}`}
        >
          <div className={full ? 'bg-red-500' : 'bg-slate-400'} style={{ width: `${used}%` }} />
          {mine > 0 && <div className="bg-amber-500" style={{ width: `${mine}%` }} />}
        </div>
        <div className={`mt-1 flex flex-wrap items-center justify-between gap-x-3 tabular-nums ${TEXT.meta}`}>
          <span>
            {full ? (
              <b className="text-red-700">여유 0 — 접수 {kw(acceptedKw)}로 한도까지 참</b>
            ) : (
              <>
                여유 <b className="text-slate-900">{kw(spareKw)}</b>
                {acceptedKw !== null && limitKw !== null && ` · 접수 ${kw(acceptedKw)} (${Math.round(used)}%)`}
              </>
            )}
            {tight && !full && (
              <span className="ml-1.5">
                <Tag tone="warn">가장 빠듯</Tag>
              </span>
            )}
          </span>
          {limitKw !== null && <span>한도 {kw(limitKw)}</span>}
        </div>
      </div>
    </div>
  );
}

function Legend({ mine }: { mine: boolean }) {
  const dot = (cls: string) => <span className={`inline-block h-2 w-2 rounded-sm ${cls}`} />;
  return (
    <p className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${TEXT.meta}`}>
      <span className="inline-flex items-center gap-1">{dot('bg-slate-400')} 이미 접수</span>
      {mine && <span className="inline-flex items-center gap-1">{dot('bg-amber-500')} 이 땅 예상 용량</span>}
      <span className="inline-flex items-center gap-1">{dot('bg-brand-200')} 남은 여유</span>
    </p>
  );
}

function OtherLines({ rows, dong }: { rows: GridRow[]; dong: boolean }) {
  return (
    <details>
      <summary className={`cursor-pointer ${TEXT.label}`}>
        {dong ? '같은 동의 다른 선로' : '이 필지에 걸린 다른 선로'} {rows.length}개
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-small">
          <thead>
            <tr className="font-bold text-slate-500">
              <Th left>변전소 · 변압기 · 선로</Th>
              {GRID_LAYERS.map((k) => (
                <Th key={k}>{LAYER_NAME[k]} 여유</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.substation}-${r.transformer}-${r.feeder}-${i}`} className="border-t border-slate-100">
                <Td left className="text-slate-900">
                  {r.substation} · #{r.transformer ?? '—'} · {r.feeder}
                </Td>
                {GRID_LAYERS.map((k) => {
                  const v = r.layers[k].spareKw;
                  return (
                    <Td key={k} num className={v !== null && v <= 0 ? 'font-bold text-red-700' : 'text-slate-700'}>
                      {kw(v)}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
