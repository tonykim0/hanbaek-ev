'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Btn, Err, Note, SectionHead } from '@/components/ui';
import { MODULE, TILT_DEG } from '@/lib/solar/assumptions';
import { boxArea, boxCorners, type GroundUse } from '@/lib/solar/boxes';
import type { LngLat, PolygonCoords } from '@/lib/solar/geo';
import type { SiteMap as SiteMapData } from '@/lib/solar/types';
import { createBoxEditor, PILL_CSS, removeEl, type BoxEditor, type EditorState } from './boxEditor';
import { latLngOf, loadKakao, type KakaoMaps, type KMap, type Listener, type PolygonShape, type Shape } from './kakao';
import { PANEL, Segmented, TEXT } from './ui';
import type { GroundPlan, SizedBox } from './useGroundBoxes';
import { useRoofTrace, type RoofPlan, type TraceResult } from './useRoofPlan';

const STYLE = {
  parcel: { strokeColor: '#f59e0b', strokeWeight: 3, strokeOpacity: 1, fillColor: '#f59e0b', fillOpacity: 0.08, zIndex: 1 },
  /** 고른 지붕 — 패널이 덮는다 */
  roofOn: { strokeColor: '#38bdf8', strokeWeight: 2, strokeOpacity: 1, strokeStyle: 'solid', fillColor: '#38bdf8', fillOpacity: 0.15, zIndex: 2 },
  /** 안 고른 지붕 — 누르면 고른다 */
  roofOff: { strokeColor: '#ffffff', strokeWeight: 2, strokeOpacity: 0.9, strokeStyle: 'shortdash', fillColor: '#ffffff', fillOpacity: 0.12, zIndex: 2 },
  house: { strokeColor: '#f43f5e', strokeWeight: 2, strokeOpacity: 1, fillColor: '#f43f5e', fillOpacity: 0.45, zIndex: 2 },
  /** 지상형 설치 영역 — 네모 · 고른 네모 · 그리는 중 미리보기 */
  box: { strokeColor: '#2563eb', strokeWeight: 2, strokeOpacity: 1, strokeStyle: 'solid', fillColor: '#3b82f6', fillOpacity: 0.25, zIndex: 3 },
  boxOn: { strokeColor: '#1d4ed8', strokeWeight: 3, strokeOpacity: 1, strokeStyle: 'solid', fillColor: '#3b82f6', fillOpacity: 0.35, zIndex: 3 },
  boxDraft: { strokeColor: '#facc15', strokeWeight: 2, strokeOpacity: 1, strokeStyle: 'shortdash', fillColor: '#facc15', fillOpacity: 0.15, zIndex: 4 },
  /** 못 까는 곳(AI 가 본 채광창·설비·정원) — 누르면 지운다 */
  cut: { strokeColor: '#ef4444', strokeWeight: 2, strokeOpacity: 1, strokeStyle: 'shortdash', fillColor: '#ef4444', fillOpacity: 0.25, zIndex: 3 },
} as const;

type Live = { map: KMap; maps: KakaoMaps };

/**
 * 필지 지도 — 위성 사진(지명 얹음, 일반 지도로는 안 바꾼다 — 한백 지시) 위에 필지(주황) · 지붕(고르면 패널) ·
 * 한전 기록을 빌려 온 둘레 필지(보라 점선) · 지상형이면 200m 안 주택(빨강)과 그려 확정한 설치 영역(파랑).
 * 지붕형의 지붕은 「AI로 패널배치하기」가 항공사진에서 딴 것뿐이다 — 지도 모양(VWorld 건물)은 그리지 않는다(한백 지시).
 * 지붕을 누르면 패널을 넣고 빼고, AI 가 본 못 까는 곳(빨간 점선)은 패널을 비우고 누르면 지운다.
 * 패널은 장수가 수만 장이라(이랜드 물류센터 1만여 장) 도형 대신 캔버스 한 장에 그린다.
 */
export default function SiteMap({
  data,
  appKey,
  plan,
  ground,
  pnu,
  heading,
  panels,
  note,
  autoRun = false,
  onAiBusy,
}: {
  data: SiteMapData;
  appKey: string | null;
  plan: RoofPlan | null;
  /** 지상형 — 그린 네모(설치 영역) */
  ground: GroundPlan | null;
  /** AI 지붕 따기에 보낼 필지번호 — 한 부지로 묶었으면 쉼표로 이은 열쇠(lib/solar/parcels traceKeyOf) */
  pnu: string | null;
  /** 판 머리의 걸음 — 제안서 생성의 「3 패널 배치」. 없으면 단추만 */
  heading?: { step: number; title: string };
  /**
   * 대신 그릴 패널 — 제안서 생성에서 고른 상품의 사업자 기준(경사각 · 줄 간격)으로 다시 깐 배치. 지도에 보이는 장수가 제안서에
   * 들어가는 장수와 같게 한다(한백 2026-11-08 UX 검토). 지붕을 빼고 넣는 것은 그대로 밑의 지붕이 받는다(캔버스는 눌림을 안 받는다)
   */
  panels?: LngLat[][] | null;
  /** 단추 옆 한 줄 — 그 배치의 장수 · 용량 */
  note?: ReactNode;
  /**
   * 처음 그릴 때 AI 패널배치를 저절로 한 번 — 제안서 생성(배치 없이는 제안서를 못 짓는다, 한백 2026-11-08 「제안서생성에서 AI로
   * 패널배치기하기 클릭하지않으면 pptx에도 안나타나네」). 부지 검토는 단추로만(배치는 고를 일이다)
   */
  autoRun?: boolean;
  /** AI 가 도는 동안 — 제안서 생성의 만들기 단추가 기다린다 */
  onAiBusy?: (busy: boolean) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef<Live | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const groundRef = useRef(ground);
  groundRef.current = ground;
  /** 고치는 중인 네모 — 편집기가 쥐고 있다. 그 상태(네모들 · 그리는 단계 · 고른 것)가 확정 단추와 안내에 보인다 */
  const editorRef = useRef<BoxEditor | null>(null);
  const [draft, setDraft] = useState<EditorState>({ boxes: [], drawing: false, selected: null });
  const nextBox = useRef(0);
  const editing = ground?.editing ?? false;
  const boxes = ground?.boxes;
  // 지붕 목록·고른 것·배치는 각자 메모된 값이라, 부모가 다시 그려져도(검색창 입력) 지도를 다시 칠하지 않는다
  const roofs = plan?.roofs;
  const cuts = plan?.cuts;
  const selected = plan?.selected;
  const layouts = plan?.layouts;

  /* ---------------- 지도와 바탕(필지 · 한전 필지 · 주택) */
  useEffect(() => {
    if (!appKey || !el.current) return;
    let alive = true;
    const shapes: Shape[] = [];
    loadKakao(appKey)
      .then((maps) => {
        if (!alive || !el.current) return;
        const at = latLngOf(maps);
        const map = new maps.Map(el.current, {
          center: new maps.LatLng(data.point.lat, data.point.lng),
          level: 3,
          mapTypeId: maps.MapTypeId.HYBRID,
        });
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

        const bounds = new maps.LatLngBounds();
        const draw = (polys: PolygonCoords[], style: Record<string, unknown>, fit: boolean) => {
          for (const p of polys) {
            const path = p.map((ring) => ring.map(at));
            if (fit) path[0]?.forEach((pt) => bounds.extend(pt));
            shapes.push(new maps.Polygon({ map, path, ...style }));
          }
        };
        draw(data.parcel, STYLE.parcel, true);
        for (const h of data.houses) draw(h, STYLE.house, true);
        for (const b of data.buildings) b.polygons.forEach((p) => p[0]?.forEach((pt) => bounds.extend(at(pt))));

        // 처음 한 번 필지 · 주택 · 건물이 다 들어오게 — 되돌리는 단추(「필지로」)는 걷었다: 처음 화면에서는 눌러도 바뀌는 게
        // 없었고, 필지가 아니라 그린 것 전부에 맞췄다(한백 「딱히 변화가 없어」 → 빼기)
        map.setBounds(bounds, 32, 32, 32, 32);

        live.current = { map, maps };
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(
          `지도를 못 불러왔습니다 (${err instanceof Error ? err.message : String(err)}) — 카카오 앱의 JavaScript SDK 도메인에 ${window.location.origin} 이 있는지 확인`,
        );
      });
    return () => {
      alive = false;
      shapes.forEach((s) => s.setMap(null));
      live.current = null;
      setReady(false);
    };
  }, [appKey, data]);

  /* ---------------- 지붕 — 고르면 하늘 실선, 안 고르면 흰 점선. 누르면 넣고 뺀다(패널은 캔버스라 누름이 지붕으로 간다) */
  const roofShapes = useRef(new Map<string, PolygonShape>());
  useEffect(() => {
    const m = live.current;
    if (!m || !roofs || !selected) return;
    const at = latLngOf(m.maps);
    const have = roofShapes.current;
    const ids = new Set(roofs.map((r) => r.id));
    for (const [id, shape] of have)
      if (!ids.has(id)) {
        shape.setMap(null);
        have.delete(id);
      }
    for (const r of roofs) {
      if (have.has(r.id)) continue;
      // 여러 고리(폴리곤 여럿)는 첫 폴리곤의 고리들 — 건물 하나는 보통 폴리곤 하나다
      const shape = new m.maps.Polygon({ map: m.map, path: r.polygons[0].map((ring) => ring.map(at)), ...STYLE.roofOff });
      m.maps.event.addListener(shape, 'click', () => planRef.current?.toggle(r.id));
      have.set(r.id, shape);
    }
    for (const r of roofs) have.get(r.id)?.setOptions(selected.has(r.id) ? STYLE.roofOn : STYLE.roofOff);
  }, [ready, roofs, selected]);
  useEffect(() => {
    const have = roofShapes.current;
    return () => {
      have.forEach((s) => s.setMap(null));
      have.clear();
    };
  }, [data]);

  /* ---------------- 못 까는 곳 — 빨간 점선. 누르면 지운다 */
  useEffect(() => {
    const m = live.current;
    if (!m || !cuts) return;
    const shapes = cuts.map((c) => {
      const shape = new m.maps.Polygon({ map: m.map, path: c.polygons[0].map((ring) => ring.map(latLngOf(m.maps))), ...STYLE.cut });
      m.maps.event.addListener(shape, 'click', () => planRef.current?.removeCut(c.id));
      return shape;
    });
    return () => shapes.forEach((s) => s.setMap(null));
  }, [ready, cuts]);

  /*
   * ---------------- 지상형 네모 고치기 — 편집기(boxEditor): 그리기 · 고르기 · 크기 · 회전 · 이동 · 지우기. 확정한 네모를
   * 다시 넣어 고치게 하고, 하나도 없으면 바로 그리기로 들어간다. 확정하면 편집기의 네모를 GroundPlan 에 넘기고 걷는다.
   */
  useEffect(() => {
    const m = live.current;
    if (!m || !editing || !el.current) return;
    const now = groundRef.current?.boxes ?? [];
    const editor = createBoxEditor({
      maps: m.maps,
      map: m.map,
      container: el.current,
      initial: now.map(({ id, center, w, h, angle }) => ({ id, center, w, h, angle })),
      angle: now.at(-1)?.angle ?? 0,
      style: STYLE.box,
      selectedStyle: STYLE.boxOn,
      previewStyle: STYLE.boxDraft,
      text: (b) => `${Math.round(boxArea(b)).toLocaleString()}㎡`,
      newId: () => `g${nextBox.current++}`,
      onChange: setDraft,
    });
    if (!now.length) editor.startDraw();
    else setDraft({ boxes: editor.boxes(), drawing: false, selected: null });
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [ready, editing]);

  /* ---------------- 지상형 확정한 네모 — 파란 면 · 가운데 넓이·용량 · 오른쪽 위 모서리의 × (누르면 그 네모만 지운다) */
  useEffect(() => {
    const m = live.current;
    if (!m || !boxes || editing) return;
    const at = latLngOf(m.maps);
    const shapes: Shape[] = [];
    for (const b of boxes) {
      const c = boxCorners(b);
      shapes.push(new m.maps.Polygon({ map: m.map, path: c.map(at), ...STYLE.box }));
      shapes.push(new m.maps.CustomOverlay({ map: m.map, position: at(b.center), content: boxLabel(b), xAnchor: 0.5, yAnchor: 0.5, zIndex: 6 }));
      shapes.push(
        new m.maps.CustomOverlay({
          map: m.map,
          position: at(c[2]),
          content: removeEl(() => groundRef.current?.remove(b.id)),
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 7,
          clickable: true,
        }),
      );
    }
    return () => shapes.forEach((sh) => sh.setMap(null));
  }, [ready, boxes, editing]);

  /*
   * ---------------- 패널 — 지도 화면 위에 투명한 캔버스 한 장을 겹쳐 그린다. 장수가 수만 장이라 카카오 도형으로는
   * 무겁고, 지도의 오버레이로 붙이면 붙인 모서리가 화면 밖으로 나갈 때(크게 확대) 카카오가 통째로 치운다.
   * 움직이고 확대할 때마다 한 프레임에 한 번 다시 그린다. 캔버스는 눌림을 받지 않아 밑의 지붕을 누를 수 있다.
   */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 지붕형의 고른 지붕 배치만 — 지상형 네모에는 패널을 그리지 않는다: 캔버스가 지도 표시 위에 깔려 네모 가운데의
  // 넓이·용량과 × 를 덮었다. 캐노피 장수는 결과 판에 있다
  const quads = useMemo(() => panels ?? [...(layouts?.values() ?? [])].flatMap((l) => l.quads), [panels, layouts]);
  useEffect(() => {
    const m = live.current;
    const canvas = canvasRef.current;
    if (!m || !canvas || !el.current) return;
    const box = el.current;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!quads.length) return;
      // 경위도 → 화면 픽셀 — 기준점 셋으로 1차식을 세운다(몇 km 안이라 충분하다)
      const proj = m.map.getProjection();
      const [lng0, lat0] = quads[0][0];
      const d = 0.01;
      const p0 = proj.containerPointFromCoords(new m.maps.LatLng(lat0, lng0));
      const pE = proj.containerPointFromCoords(new m.maps.LatLng(lat0, lng0 + d));
      const pN = proj.containerPointFromCoords(new m.maps.LatLng(lat0 + d, lng0));
      const ax = (pE.x - p0.x) / d;
      const ay = (pE.y - p0.y) / d;
      const bx = (pN.x - p0.x) / d;
      const by = (pN.y - p0.y) / d;
      // 모듈 한 장의 화면 폭 — 몇 픽셀 안 되면 테두리를 생략한다(줄무늬로만 보인다)
      const modulePx = Math.hypot(ax, ay) * (MODULE.widthM / (111_320 * Math.cos((lat0 * Math.PI) / 180)));
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = 'rgba(191, 219, 254, 0.8)';
      ctx.lineWidth = modulePx > 6 ? 0.8 : 0;
      const margin = 50;
      for (const q of quads) {
        let off = true;
        const pts = q.map(([lng, lat]) => {
          const x = p0.x + ax * (lng - lng0) + bx * (lat - lat0);
          const y = p0.y + ay * (lng - lng0) + by * (lat - lat0);
          if (x > -margin && x < w + margin && y > -margin && y < h + margin) off = false;
          return [x, y] as const;
        });
        if (off) continue;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
        if (ctx.lineWidth) ctx.stroke();
      }
    };
    const schedule: Listener = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    const events = ['bounds_changed', 'center_changed', 'zoom_changed', 'drag', 'idle'];
    for (const t of events) m.maps.event.addListener(m.map, t, schedule);
    const resize = new ResizeObserver(() => schedule());
    resize.observe(box);
    return () => {
      for (const t of events) m.maps.event.removeListener(m.map, t, schedule);
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [ready, quads]);

  /* ---------------- AI 패널배치 — 단추 · 저절로(autoRun) 같은 길 하나(useRoofTrace) */
  const { ai, run: findRoofs } = useRoofTrace(pnu, plan, autoRun, onAiBusy);

  if (!appKey) {
    return (
      <div className={`${PANEL} flex h-24 items-center justify-center px-4 text-center ${TEXT.label}`}>
        지도 — 카카오 JavaScript 키(KAKAO_JS_KEY)가 아직 없습니다
      </div>
    );
  }

  const aiButton = plan && (
    <Btn kind={plan.roofs.length ? 'side' : 'do'} onClick={findRoofs} busy={ai.busy} busyLabel="AI가 패널 배치하는 중…">
      AI로 패널배치하기
    </Btn>
  );
  const addBox = () => editorRef.current?.startDraw();
  const confirmBoxes = () => {
    const editor = editorRef.current;
    if (editor && ground) ground.confirm(editor.boxes());
  };
  const draftArea = draft.boxes.reduce((sum, b) => sum + boxArea(b), 0);
  // 고치는 동안 지도 아래 한 줄 — 지금 할 일 하나만
  const editHint = draft.drawing
    ? '누른 채로 끌어서 설치면적을 그리세요'
    : draft.selected
      ? '모서리 □ 크기 · 위 ↻ 회전 · 가운데 글자를 끌면 이동'
      : '설치면적을 누르면 크기 · 회전 손잡이가 나옵니다';
  const swatch = (cls: string, text: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} /> {text}
    </span>
  );

  return (
    <div className={`${PANEL} overflow-hidden`}>
      {/*
       * 지붕형의 주 단추 — 지도 밖 위 왼쪽, 보통 크기(한백 2026-11-08 「AI로 지붕찾기 버튼을 지도에서 빼서 지도 왼쪽 위에 올려줘.
       * 사람들이 잘 못보는듯」 — 지도 안 왼쪽 위의 작은 단추였다). 이름은 「AI로 패널배치하기」(같은 날). 패널은 AI 가 딴 지붕에만 깔린다.
       * 지도가 안 떠도 누를 수 있다 — 지붕을 받아 오는 일이라 지도와 상관없다(용량 · 제안서는 그대로 바뀐다).
       */}
      {plan && pnu && (
        <div className="px-5 py-3">
          {heading ? (
            <SectionHead step={heading.step} title={heading.title} action={aiButton} meta={note} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {aiButton}
              {note && <span className={`${TEXT.meta} tabular-nums`}>{note}</span>}
            </div>
          )}
        </div>
      )}
      <div className="relative bg-slate-200">
        <div ref={el} className="h-80 w-full sm:h-[28rem]" role="region" aria-label="필지 지도" />
        {/* 카카오 지도 상자가 제 z-index 를 갖고 있어 그 위로 올린다 — 위의 단추(z-10)보다는 아래 */}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden />
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center bg-slate-100 px-6 text-center text-base font-bold text-red-700">
            {error}
          </p>
        ) : (
          ready &&
          ground && (
            <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
              {/* 지상형 — 설치면적은 지도에 그리는 일이라 지도 위에 둔다 */}
              {editing ? (
                <>
                  <Btn size="sm" kind="side" onClick={addBox}>
                    면적 추가
                  </Btn>
                  <Btn size="sm" onClick={confirmBoxes} className="tabular-nums">
                    확정 · {draft.boxes.length}곳 {Math.round(draftArea).toLocaleString()}㎡
                  </Btn>
                  <Btn size="sm" kind="side" onClick={ground.cancel}>
                    취소
                  </Btn>
                </>
              ) : (
                <Btn size="sm" kind={ground.boxes.length ? 'side' : 'do'} onClick={ground.startEdit}>
                  {ground.boxes.length ? '설치면적 수정' : '설치면적 설정'}
                </Btn>
              )}
            </div>
          )
        )}
        {/* 패널이 깔려 있으면 — 패널을 누르면 그 지붕 패널이 빠진다는 것을 지도 위에(한백 지시). 누름은 밑의 지도로 간다.
            아래쪽 가운데 — 위는 단추·확대, 왼쪽 아래는 카카오 축척 */}
        {ready && !error && plan && plan.count > 0 && <MapHint text="패널을 누르면 그 지붕 패널이 사라집니다" />}
        {/* 네모는 파워포인트처럼 누른 채 끌어서 그린다 — 그리는 동안은 지도가 안 끌린다 */}
        {ready && !error && editing && <MapHint text={editHint} />}
      </div>
      {/* 지도 밑 — 고른 지붕·배치 방식 · 범례 · AI 결과. 장수·용량은 결과 판에만 둔다 */}
      <div className="space-y-2 px-5 py-3" data-map-foot>
        {plan && <PlanBar plan={plan} />}
        {ground && <GroundBar ground={ground} editing={editing} />}
        <p className={`flex flex-wrap gap-x-4 gap-y-1 ${TEXT.meta}`}>
          {swatch('bg-amber-500/30 ring-2 ring-amber-500', '필지')}
          {plan && plan.roofs.length > 0 && swatch('bg-blue-900', '패널')}
          {plan && plan.roofs.length > plan.selected.size && swatch('bg-white ring-1 ring-slate-400', '패널 없는 지붕 — 누르면 깔림')}
          {plan && plan.cuts.length > 0 && swatch('bg-red-500/40 ring-1 ring-red-500', '못 까는 곳 — 누르면 지움')}
          {ground && ground.boxes.length > 0 && swatch('bg-blue-500/30 ring-1 ring-blue-600', '설치면적 — ×로 지움')}
          {data.houses.length > 0 && swatch('bg-rose-500/60 ring-1 ring-rose-500', '200m 안 주택')}
        </p>
        {ai.msg && (ai.error ? <Err className="block">{ai.msg}</Err> : <p className={TEXT.body}>{ai.msg}</p>)}
        {ai.trace && <AiNotes trace={ai.trace} />}
      </div>
    </div>
  );
}

/** 지도 밑 한 줄 — 고른 지붕 · 빼기 · 배치 방식 */
function PlanBar({ plan }: { plan: RoofPlan }) {
  if (!plan.roofs.length) return null;
  const chosen = plan.roofs.filter((r) => plan.selected.has(r.id)).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className={`${TEXT.body} tabular-nums`}>
        고른 지붕 {chosen}/{plan.roofs.length}곳
        {plan.cuts.length ? ` · 못 까는 곳 ${plan.cuts.length}곳` : ''}
      </p>
      {plan.basis === 'layout' && (
        <Segmented
          value={plan.style}
          onChange={plan.setStyle}
          options={
            [
              ['tilted', `경사고정형 ${TILT_DEG.roof}°`],
              ['flush', '지붕면 부착형'],
            ] as const
          }
        />
      )}
    </div>
  );
}

/** 지상형 지도 밑 한 줄 — 그린 네모 수 · 설치 방식(주차장 캐노피 · 땅에 세움) */
function GroundBar({ ground, editing }: { ground: GroundPlan; editing: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {/* 고치는 동안의 개수는 확정 단추에 있다 — 여기는 확정한 것만 */}
      <p className={`${TEXT.body} tabular-nums`}>{editing ? '설치면적 수정 중' : `설치면적 ${ground.boxes.length}곳`}</p>
      <Segmented<GroundUse>
        value={ground.use}
        onChange={ground.setUse}
        options={
          [
            ['carport', '주차장 캐노피'],
            ['land', '땅에 세움'],
          ] as const
        }
      />
    </div>
  );
}

/** AI 가 본 것 — 지붕마다 갈래·설명, 못 까는 곳. 이미 깔린 태양광은 맨 위에 짚는다(영업에서 먼저 물을 것) */
function AiNotes({ trace }: { trace: TraceResult }) {
  const existing = trace.obstacles.filter((o) => /태양광|PV|모듈/.test(o.note));
  return (
    <>
      {existing.length > 0 && (
        <Note>AI: 지붕 일부에 이미 태양광이 깔려 있는 것으로 보입니다 — {existing.map((o) => o.note).join(' · ')}</Note>
      )}
      <details>
        <summary className={`cursor-pointer ${TEXT.label}`}>AI가 본 것</summary>
        <ul className={`mt-1 space-y-0.5 ${TEXT.body}`}>
          {trace.roofs.map((r, i) => (
            <li key={`r${i}`}>
              <span className="font-bold text-slate-900">{r.kind}</span> {Math.round(r.area ?? 0).toLocaleString()}㎡ — {r.note}
            </li>
          ))}
          {trace.obstacles.map((o, i) => (
            <li key={`o${i}`} className="text-red-700">
              못 까는 곳 — {o.note}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

/** 지도 아래쪽 가운데 한 줄 — 위는 단추·확대, 왼쪽 아래는 카카오 축척. 누름은 밑의 지도로 지나간다 */
function MapHint({ text }: { text: string }) {
  return (
    <p className="pointer-events-none absolute bottom-9 left-1/2 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1.5 text-center text-xs font-semibold text-white shadow">
      {text}
    </p>
  );
}

/** 확정한 네모 가운데 — 넓이 · 예상 용량 */
function boxLabel(b: SizedBox): HTMLElement {
  const div = document.createElement('div');
  div.textContent = `${Math.round(b.area).toLocaleString()}㎡ · ${b.kw.toLocaleString()}kW`;
  div.style.cssText = PILL_CSS;
  return div;
}
