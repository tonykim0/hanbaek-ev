/**
 * 태양광 현장관리 — 태양광 사업의 첫 화면(2026-11-03 시작). [한백 전용]
 *
 * 지금은 틀만 선다 — 사업 전환(상단 바) · 태양광 틀 색 · 단계 칸(lib/solar/stages 초안). 현장은 아직 0건이다:
 * 현장을 어디서 받아(검토 사이트의 결과 · 직접 등록) 무엇을 기록할지는 한백의 역할이 정해진 뒤에 붙인다.
 * (admin) 그룹 아래라 협력사에게는 열리지 않는다 — 태양광 협력사 계정이 생기면 그때 문을 연다.
 */
import { SOLAR_STAGES } from '@/lib/solar/stages';

export const metadata = { title: '태양광 현장관리 — 한백 태양광사업관리' };

export default function SolarPage() {
  return (
    <div>
      <h1 className="mb-5 text-h1 font-black text-slate-900">현장관리</h1>
      {/* 전기차 보드와 같은 칸 모양 — 칸이 많아 좁은 화면에서는 옆으로 민다 */}
      <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7">
        <div
          className="grid min-h-[24rem] gap-3"
          style={{ gridTemplateColumns: `repeat(${SOLAR_STAGES.length}, minmax(168px, 1fr))` }}
        >
          {SOLAR_STAGES.map((s) => (
            <section key={s.key} aria-label={s.label} className="flex min-w-0 flex-col rounded-panel border border-slate-200 bg-slate-50/60 p-2.5">
              <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                <h3 className="text-base font-black tracking-[-0.01em] text-slate-800">{s.label}</h3>
                <span className="text-lead font-black tabular-nums text-slate-300">0</span>
              </header>
              <p className="flex flex-1 items-center justify-center rounded-box border border-dashed border-slate-200 text-tiny text-slate-300">
                없음
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
