import { boxCorners, boxFromCorners, knobPoint, MIN_SIDE_M, moveBy, resizeCorner, rotateToward, type Box } from '@/lib/solar/boxes';
import type { LngLat } from '@/lib/solar/geo';
import { latLngOf, type KakaoMaps, type KMap, type Listener, type Overlay, type PolygonShape } from './kakao';

/**
 * 지상형 네모 고치기 — 파워포인트처럼(한백 「돌릴 수 있는 네모 필요」): 네모를 누르면 고르고, 모서리 □ 를 끌면 크기,
 * 위 ↻ 를 끌면 회전, 가운데 글자를 끌면 이동, × 는 지운다. 새 네모는 누른 채 끌었다 놓아서 그린다(한백 「클릭하고
 * 드래그해야만 생기는 거고, 클릭·드래그·클릭으로는 하지 마」) — 그리는 동안은 지도 끌기를 멈추고 지도 상자에서 누름을
 * 먼저 받는다. 새 네모는 마지막으로 돌린 기울기를 따른다(비스듬한 주차장에 여러 개를 나란히 그릴 때 한 번만 돌리면 된다).
 *
 * 카카오 그리기 도구의 네모는 남북으로만 반듯해 못 돌린다 — 그래서 도형 · 손잡이(CustomOverlay)를 직접 그리고 끈다.
 * 끄는 동안은 지도 끌기를 끄고(setDraggable), 손을 떼면 바뀐 네모들을 onChange 로 알린다. React 상태는 거기서만 바뀐다.
 */
export type EditorState = {
  boxes: Box[];
  /** 끌어서 새 네모를 그리기를 기다림 */
  drawing: boolean;
  selected: string | null;
};

export type BoxEditor = { startDraw(): void; boxes(): Box[]; destroy(): void };

type View = { box: Box; poly: PolygonShape; label: Overlay; labelEl: HTMLElement; remove: Overlay };

/** 돌리는 손잡이를 위 변에서 몇 px 바깥에 두나 — 확대해도 화면에서 같은 거리 */
const KNOB_PX = 28;

export function createBoxEditor(o: {
  maps: KakaoMaps;
  map: KMap;
  /** 지도 상자 — 화면 좌표를 지도 좌표로 바꿀 때 */
  container: HTMLElement;
  initial: Box[];
  /** 새 네모의 처음 기울기 */
  angle: number;
  style: Record<string, unknown>;
  selectedStyle: Record<string, unknown>;
  previewStyle: Record<string, unknown>;
  /** 네모 가운데 글자 */
  text: (b: Box) => string;
  newId: () => string;
  onChange: (s: EditorState) => void;
}): BoxEditor {
  const { maps, map } = o;
  const at = latLngOf(maps);
  const views = new Map<string, View>();
  let selected: string | null = null;
  let drawing = false;
  let preview: PolygonShape | null = null;
  let angle = o.angle;
  let handles: Overlay[] = [];
  /** 도형 누름과 지도 누름이 한 번에 같이 온다 — 같은 누름을 두 번 쓰지 않게. 끌어 그린 뒤 따라오는 지도 누름도 */
  let shapeClickAt = 0;

  const emit = () => o.onChange({ boxes: [...views.values()].map((v) => v.box), drawing, selected });

  /** 화면(client) 좌표 → 경위도 */
  const toLL = (clientX: number, clientY: number): LngLat => {
    const r = o.container.getBoundingClientRect();
    const ll = map.getProjection().coordsFromContainerPoint(new maps.Point(clientX - r.left, clientY - r.top));
    return [ll.getLng(), ll.getLat()];
  };

  /** 돌리는 손잡이 자리 — 위 변 가운데에서 화면으로 KNOB_PX 바깥 */
  const knobAt = (b: Box): LngLat => {
    const proj = map.getProjection();
    const p0 = proj.containerPointFromCoords(at(knobPoint(b, 0)));
    const p1 = proj.containerPointFromCoords(at(knobPoint(b, 10)));
    const pxPerM = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10;
    return knobPoint(b, pxPerM > 0 ? KNOB_PX / pxPerM : 3);
  };

  /** 손잡이 끌기 — 누른 자리에서 시작해 손을 뗄 때까지. 그동안 지도는 안 끌린다 */
  const startDrag = (e: PointerEvent, begin: (p: LngLat) => (q: LngLat) => void, end?: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    map.setDraggable(false);
    const step = begin(toLL(e.clientX, e.clientY));
    const move = (ev: PointerEvent) => step(toLL(ev.clientX, ev.clientY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      map.setDraggable(true);
      end?.();
      emit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const clearHandles = () => {
    handles.forEach((h) => h.setMap(null));
    handles = [];
  };

  const placeHandles = (v: View) => {
    const c = boxCorners(v.box);
    if (handles.length === 5) {
      c.forEach((p, i) => handles[i].setPosition(at(p)));
      handles[4].setPosition(at(knobAt(v.box)));
      return;
    }
    clearHandles();
    c.forEach((p, i) => {
      const el = handleEl('corner', '끌어서 크기 바꾸기');
      el.addEventListener('pointerdown', (e) => startDrag(e, () => (q) => setBox(v, resizeCorner(v.box, i, q))));
      handles.push(new maps.CustomOverlay({ map, position: at(p), content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 9, clickable: true }));
    });
    const k = handleEl('knob', '끌어서 돌리기');
    k.addEventListener('pointerdown', (e) =>
      startDrag(
        e,
        () => (q) => setBox(v, rotateToward(v.box, q)),
        () => {
          angle = v.box.angle;
        },
      ),
    );
    handles.push(new maps.CustomOverlay({ map, position: at(knobAt(v.box)), content: k, xAnchor: 0.5, yAnchor: 0.5, zIndex: 9, clickable: true }));
  };

  const render = (v: View) => {
    const c = boxCorners(v.box);
    v.poly.setPath(c.map(at));
    v.label.setPosition(at(v.box.center));
    v.labelEl.textContent = o.text(v.box);
    v.remove.setPosition(at(c[2]));
    if (selected === v.box.id) placeHandles(v);
  };

  const setBox = (v: View, b: Box) => {
    v.box = b;
    render(v);
  };

  const select = (id: string | null) => {
    if (selected === id) return;
    selected = id;
    clearHandles();
    for (const w of views.values()) w.poly.setOptions(w.box.id === id ? o.selectedStyle : o.style);
    const v = id ? views.get(id) : undefined;
    if (v) placeHandles(v);
    emit();
  };

  const drop = (id: string) => {
    const v = views.get(id);
    if (!v) return;
    if (selected === id) {
      selected = null;
      clearHandles();
    }
    v.poly.setMap(null);
    v.label.setMap(null);
    v.remove.setMap(null);
    views.delete(id);
    emit();
  };

  const add = (b: Box) => {
    const poly = new maps.Polygon({ map, path: boxCorners(b).map(at), ...o.style });
    const labelEl = document.createElement('div');
    labelEl.title = '끌어서 옮기기';
    labelEl.style.cssText = `${PILL_CSS};cursor:move;touch-action:none;user-select:none`;
    const label = new maps.CustomOverlay({ map, position: at(b.center), content: labelEl, xAnchor: 0.5, yAnchor: 0.5, zIndex: 8, clickable: true });
    const rmEl = removeEl();
    const remove = new maps.CustomOverlay({ map, position: at(boxCorners(b)[2]), content: rmEl, xAnchor: 0.5, yAnchor: 0.5, zIndex: 9, clickable: true });
    const v: View = { box: b, poly, label, labelEl, remove };
    views.set(b.id, v);
    maps.event.addListener(poly, 'click', () => {
      shapeClickAt = Date.now();
      if (!drawing) select(v.box.id);
    });
    labelEl.addEventListener('pointerdown', (e) => {
      select(v.box.id);
      startDrag(e, (p0) => {
        const start = v.box;
        return (q) => setBox(v, moveBy(start, p0, q));
      });
    });
    rmEl.addEventListener('click', (e) => {
      e.stopPropagation();
      drop(v.box.id);
    });
    render(v);
  };

  const clearPreview = () => {
    preview?.setMap(null);
    preview = null;
  };

  /** 그리기를 켜고 끈다 — 켜면 지도 끌기를 멈추고(끌면 네모가 그려져야 한다) 손가락으로 끌어도 화면이 안 밀리게 */
  const setDrawing = (on: boolean) => {
    drawing = on;
    map.setDraggable(!on);
    o.container.style.touchAction = on ? 'none' : '';
    o.container.style.cursor = on ? 'crosshair' : '';
  };

  /* 끌어서 그리기 — 지도 상자에서 누름을 먼저 받는다(캡처). 누른 자리가 한 모서리, 놓은 자리가 맞은편 모서리 */
  const onDown = (e: PointerEvent) => {
    if (!drawing || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    const a = toLL(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => {
      const path = boxCorners(boxFromCorners('preview', a, toLL(ev.clientX, ev.clientY), angle)).map(at);
      if (preview) preview.setPath(path);
      else preview = new maps.Polygon({ map, path, ...o.previewStyle });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      clearPreview();
      if (ev.type === 'pointercancel') return emit();
      const b = boxFromCorners(o.newId(), a, toLL(ev.clientX, ev.clientY), angle);
      // 끌지 않고 누르기만 했으면(1m 보다 작음) 그리기를 그대로 기다린다
      if (b.w >= MIN_SIDE_M && b.h >= MIN_SIDE_M) {
        setDrawing(false);
        add(b);
        // 놓은 뒤 지도가 보내는 누름이 방금 고른 네모를 풀지 않게
        shapeClickAt = Date.now() + 250;
        select(b.id);
      }
      emit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /* 지도 누름 — 네모 밖을 누르면 고른 것을 푼다 */
  const onClick: Listener = () => {
    if (!drawing && Date.now() - shapeClickAt > 80) select(null);
  };
  /* 확대 단계가 바뀌면 돌리는 손잡이의 거리를 다시 잰다 */
  const onZoom: Listener = () => {
    const v = selected ? views.get(selected) : undefined;
    if (v) placeHandles(v);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !drawing) return;
    clearPreview();
    setDrawing(false);
    emit();
  };

  maps.event.addListener(map, 'click', onClick);
  maps.event.addListener(map, 'zoom_changed', onZoom);
  o.container.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey);
  for (const b of o.initial) add(b);

  return {
    startDraw() {
      select(null);
      clearPreview();
      setDrawing(true);
      emit();
    },
    boxes: () => [...views.values()].map((v) => v.box),
    destroy() {
      maps.event.removeListener(map, 'click', onClick);
      maps.event.removeListener(map, 'zoom_changed', onZoom);
      o.container.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      setDrawing(false);
      clearHandles();
      clearPreview();
      for (const v of views.values()) {
        v.poly.setMap(null);
        v.label.setMap(null);
        v.remove.setMap(null);
      }
      views.clear();
      map.setDraggable(true);
    },
  };
}

/** 모서리 □ · 위 ↻ — 손가락으로도 잡히게 22px */
function handleEl(kind: 'corner' | 'knob', title: string): HTMLElement {
  const d = document.createElement('div');
  d.title = title;
  d.setAttribute('aria-label', title);
  d.textContent = kind === 'knob' ? '↻' : '';
  d.style.cssText =
    kind === 'knob'
      ? "width:24px;height:24px;border-radius:9999px;background:#fff;border:2px solid #1d4ed8;color:#1d4ed8;font:700 14px/20px 'Pretendard Variable',sans-serif;text-align:center;cursor:grab;touch-action:none;user-select:none;box-shadow:0 1px 3px rgba(0,0,0,.35)"
      : 'width:14px;height:14px;background:#fff;border:2px solid #1d4ed8;cursor:nwse-resize;touch-action:none;box-shadow:0 1px 3px rgba(0,0,0,.35)';
  return d;
}

/** 네모 지우기 × */
/** 지도 위 흰 둥근 꼬리표(네모 가운데 넓이 · 용량) — 끌어 옮기는 꼬리표와 확정한 네모의 꼬리표가 같은 모양이다 */
export const PILL_CSS =
  "padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,.92);color:#0f172a;font:700 12px/1.6 'Pretendard Variable',sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35);font-variant-numeric:tabular-nums";

export function removeEl(onClick?: () => void): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '×';
  b.setAttribute('aria-label', '이 설치면적 지우기');
  b.style.cssText =
    "width:24px;height:24px;border-radius:9999px;background:#fff;color:#0f172a;font:700 16px/22px 'Pretendard Variable',sans-serif;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:pointer;padding:0";
  if (onClick)
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  return b;
}
