'use client';

/**
 * 사진 → 스캔본 — 휴대폰으로 찍은 서류를 스캐너로 민 것처럼 만든다.
 *
 * ★왜 있는가★ 접수에서 「휴대폰 사진으로 보임」을 짚어 반려하게 만들었는데(lib/photo-check,
 * 2026-08-31), 반려당한 사람이 할 수 있는 일이 없었다 — 스캐너를 다시 찾아가는 것뿐이다.
 * 짚기만 하고 고칠 길을 안 주면 그 표는 잔소리가 된다. 이 화면이 그 길이다(한백 지시).
 *
 * ★서버를 쓰지 않는다.★ 전부 브라우저 캔버스에서 돈다 — 원본 사진이 우리 저장소로 갈
 * 이유가 없고(개인 책상·손이 같이 찍힌다), 판독 비용도 안 나가고, 무엇보다 네 점을
 * 끌면서 결과를 바로 볼 수 있다. 계산은 lib/scanify 가 하고 여기서는 그리고 받는다.
 *
 * 차례는 셋이다: 사진을 넣는다 → 네 점을 맞춘다(자동으로 잡아 두고 사람이 고친다) →
 * A4 PDF 로 받는다. 여러 장이면 한 묶음으로 나온다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  estimateQuad, flatten, orderQuad, outputSize, warpToRect, type Bitmap, type Pt,
} from '@/lib/scanify';
import { useFileDragging } from '@/components/DocFiles';
import { pdfPages } from '@/lib/pdf-render';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { Btn, Choice, Err, PANEL } from '@/components/ui';

/** 한 장 — 원본 그림과 사람이 맞춘 네 점 */
interface Shot {
  id: string;
  name: string;
  /** 화면에 그릴 작업본 — 줄여서 들고 있는다. 네 점을 끄는 동안 쓰는 것이 이것이다 */
  bmp: Bitmap;
  quad: Pt[];
  /**
   * ★PDF 를 만들 때만 원본으로 되돌아간다★ (한백 지적 2026-09-21 「스캔하면 화질이 많이
   * 떨어지는」).
   *
   * 그전에는 줄여 둔 작업본(bmp)에서 곧바로 펴서 PDF 로 구웠다 — 아이폰 4032px 사진이
   * 읽히는 순간 2000px 이 되고, 그 뒤로 원본은 어디에도 없었다. 출력 해상도를 아무리
   * 올려도 그 2000px 을 늘리는 것뿐이라 화질이 돌아오지 않는다.
   *
   * 그래서 원본을 다시 여는 길을 들고 있는다. 미리 굽지 않는다 — 20장을 한꺼번에 원본으로
   * 들면 4천만 화소 × 20 이라 브라우저가 죽는다. 만들 때 한 장씩 열고 그 자리에서 버린다.
   * 실패하면(브라우저가 큰 캔버스를 거절) 작업본으로 되돌아간다 — 화질보다 만들어지는 것이
   * 먼저다.
   */
  full: () => Promise<Bitmap>;
}

/**
 * ★화면에서 끌 때만★ 이만큼으로 줄여 들고 있는다.
 *
 * 요즘 휴대폰 사진은 4000×3000 이 예사인데, 그대로 두면 네 점을 끌 때마다 4천만 화소를
 * 다시 그린다 — 손가락을 따라오지 못한다.
 *
 * ★결과물은 이 값을 안 본다★ (2026-09-21) — 만들 때 원본을 다시 열어 거기서 편다(Shot.full).
 * 그전에는 이 작업본이 곧 결과물의 출처여서, 여기서 깎인 화소가 영영 돌아오지 않았다.
 */
const WORK_MAX = 2000;

/**
 * 원본을 다시 열 때의 상한 — 한 변과 총 화소, 둘 다 본다.
 *
 * 300dpi A4 가 3508×2480(8.7백만 화소)이라 그보다 넉넉해야 한다. 종이가 사진의 일부만
 * 차지하므로 원본은 그보다 커야 결과가 300dpi 에 닿는다.
 *
 * ★총 화소를 따로 막는 이유★ — iOS 사파리는 캔버스 넓이를 1,670만 화소쯤에서 자르는데,
 * 넘으면 오류를 던지지 않고 ★빈 흰 그림★을 준다. 48메가픽셀로 찍는 요즘 아이폰(8064×6048)
 * 은 한 변만 재면 그 선을 넘어선다 — 그러면 협력사는 백지 스캔본을 받고 왜인지 알 수 없다.
 * 1,200만으로 잡아 그 선에서 멀찍이 떨어뜨린다(옛 작업본 300만 화소의 네 곱이다).
 */
const FULL_MAX = 5000;
const FULL_AREA = 12_000_000;

/**
 * Bitmap → ImageData.
 *
 * ★한 번 베낀다★ — ImageData 는 ArrayBuffer 로 뒷받침된 배열만 받는데(형이 그렇게 좁다),
 * 우리 Bitmap 은 어디서 왔는지 모르는 배열이다. 베끼지 않으면 형이 안 맞고, 억지로 맞추면
 * 브라우저에 따라 SharedArrayBuffer 가 들어와 조용히 깨질 자리를 남긴다.
 */
const asImageData = (b: Bitmap) =>
  new ImageData(new Uint8ClampedArray(b.data), b.width, b.height);

/**
 * 한 장 이상으로 읽는다 — ★PDF 면 장마다 하나씩★.
 *
 * ★PDF 로 감싼 사진이 실제로 온다★ (한백 지시 2026-08-31). 접수에서 잡아내는 「휴대폰
 * 사진」의 상당수가 그 꼴이다(페이지가 용지 규격이 아니고 4:3, lib/photo-check).
 * 그런데 고치는 화면이 PDF 를 안 받으면 ★딱지가 붙은 파일을 정작 고칠 수 없다★ —
 * 짚기만 하고 길이 없는 자리가 된다.
 *
 * 이미 스캔된 PDF 를 넣어도 상관없다: 종이가 반듯하면 네 점이 가장자리에 서고 결과는
 * 거의 그대로다. 「사진인지 아닌지」를 여기서 판정하지 않는다 — 넣은 사람이 안다.
 */
async function readPdf(file: File): Promise<{ shots: Shot[]; dropped: number }> {
  const { pages, total } = await pdfPages(await file.arrayBuffer(), {
    maxPx: WORK_MAX,
    /* 스캔 묶음을 통째로 넣으면 수십 장을 굽다가 화면이 얼어붙는다 */
    maxPages: 20,
  });
  return {
    shots: pages.map((bmp, i) => ({
      id: `${file.name}-${i}`,
      name: total > 1 ? `${file.name} (${i + 1}쪽)` : file.name,
      bmp,
      quad: orderQuad(estimateQuad(bmp)),
      /*
       * 그 쪽 하나만 높은 해상도로 다시 그린다 — 20쪽을 통째로 다시 굽지 않는다.
       * pdfPages 는 「원본보다 크게 그리지 않는다」를 이미 지킨다(scale 을 2 로 막는다).
       */
      full: async () => {
        const r = await pdfPages(await file.arrayBuffer(), {
          maxPx: FULL_MAX,
          maxPages: i + 1,
          /* 300dpi = 72dpi × 4.17 — A4 한 장이 3508×2480(8.7백만 화소)이라 넉넉히 들어간다 */
          maxScale: 300 / 72,
        });
        return r.pages[i] ?? bmp;
      },
    })),
    dropped: Math.max(0, total - pages.length),
  };
}

/** 그림 파일 하나를 캔버스에 그려 Bitmap 으로 — maxPx 는 상한이고 원본보다 키우지 않는다 */
async function drawFile(file: File, maxPx: number, area = Infinity): Promise<Bitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name} 을(를) 읽지 못했습니다.`));
      el.src = url;
    });
    const scale = Math.min(
      1,
      maxPx / Math.max(img.naturalWidth, img.naturalHeight),
      /* 총 화소 한도 — 넘으면 브라우저가 말없이 빈 그림을 준다(위 FULL_AREA) */
      Math.sqrt(area / Math.max(1, img.naturalWidth * img.naturalHeight))
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 그림을 다룰 수 없습니다.');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h) as unknown as Bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readShot(file: File): Promise<Shot> {
  const bmp = await drawFile(file, WORK_MAX);
  return {
    id: `${file.name}-${file.size}-${Math.round(bmp.width * bmp.height)}`,
    name: file.name,
    bmp,
    quad: orderQuad(estimateQuad(bmp)),
    /* 만들 때 다시 연다 — 파일은 브라우저가 들고 있고 우리는 손잡이만 쥔다 */
    full: () => drawFile(file, FULL_MAX, FULL_AREA),
  };
}

/** Bitmap 을 캔버스에 그려 JPEG 로 짜낸다 — PDF 에 넣을 꼴 */
async function toJpeg(bmp: Bitmap, quality: number): Promise<Uint8Array> {
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 그림을 다룰 수 없습니다.');
  ctx.putImageData(asImageData(bmp), 0, 0);
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('그림을 만들지 못했습니다.');
  return new Uint8Array(await blob.arrayBuffer());
}

export default function PhotoScanner() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [at, setAt] = useState(0);
  const [mono, setMono] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const dragging = useFileDragging();

  /* 만들다 만 것을 두고 나가면 다시 찍어야 한다 — 파일이 우리 쪽에 없다 */
  useLeaveGuard(
    shots.length > 0,
    '아직 스캔본을 내려받지 않았습니다. 이 페이지를 벗어나면 사라집니다 — 나가시겠습니까?'
  );

  const shot = shots[at] ?? null;

  /* ★FileList 가 아니라 File[] 을 받는다★ — 이유는 아래 파일 입력에 적었다 */
  const take = useCallback(async (files: File[]) => {
    const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const picked = files.filter((f) => f.type.startsWith('image/') || isPdf(f));
    if (picked.length === 0) {
      setError('사진(JPG·PNG·HEIC)이나 PDF 를 넣어주세요.');
      return;
    }
    setError(null);
    setBusy(`${picked.length}개 읽는 중…`);
    try {
      const read: Shot[] = [];
      let dropped = 0;
      for (const f of picked) {
        if (isPdf(f)) {
          const r = await readPdf(f);
          read.push(...r.shots);
          dropped += r.dropped;
        } else {
          read.push(await readShot(f));
        }
      }
      if (read.length === 0) throw new Error('읽을 수 있는 장이 없습니다.');
      /* ★자른 것은 말한다★ — 조용히 20장만 가져오면 나머지가 사라진 것을 사람이 모른다 */
      if (dropped > 0) setError(`장이 많아 앞 20장만 가져왔습니다 — ${dropped}장은 빠졌습니다.`);
      setShots((prev) => {
        setAt(prev.length);
        return [...prev, ...read];
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const make = async () => {
    if (shots.length === 0) return;
    setError(null);
    setBusy('스캔본 만드는 중…');
    try {
      const pdf = await PDFDocument.create();
      let n = 0;
      for (const s of shots) {
        n += 1;
        setBusy(shots.length > 1 ? `스캔본 만드는 중… (${n}/${shots.length})` : '스캔본 만드는 중…');
        /*
         * ★원본에서 편다★ (한백 지적 2026-09-21) — 화면이 들고 있는 작업본은 2000px 로
         * 줄여 둔 것이라, 거기서 펴면 출력 해상도를 올려도 없는 화소를 늘릴 뿐이다.
         * 네 점은 작업본의 좌표라 원본 크기에 맞춰 같은 배로 키운다(가로세로 배율이 같다).
         * 원본을 못 열면 작업본으로 만든다 — 화질보다 만들어지는 것이 먼저다.
         */
        const src = await s.full().catch(() => s.bmp);
        const k = src.width / s.bmp.width;
        const quad = k === 1 ? s.quad : s.quad.map((p) => ({ x: p.x * k, y: p.y * k }));
        const size = outputSize(quad);
        const flat = flatten(warpToRect(src, quad, size.w, size.h), { mono });
        const jpg = await toJpeg(flat, 0.92);
        const img = await pdf.embedJpg(jpg);
        /* 종이 크기를 A4(포인트)로 못 박는다 — 장마다 크기가 다르면 인쇄가 어긋난다 */
        const [pw, ph] = size.w > size.h ? [841.89, 595.28] : [595.28, 841.89];
        const page = pdf.addPage([pw, ph]);
        page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `스캔본_${shots.length}장.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const catchDrop = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (busy) return;
      void take([...e.dataTransfer.files]);
    },
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 넣는 자리 — 접수 화면의 ZIP 상자와 같은 꼴이다(상자째 누르고, 끌어다 놓는다) */}
      <label
        {...catchDrop}
        className={`relative block rounded-2xl border-2 border-dashed p-5 transition ${
          busy ? 'cursor-default opacity-60' : 'cursor-pointer'
        } ${over ? 'border-brand-500 bg-brand-50' : 'border-brand-300 bg-brand-50/40'}`}
      >
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          disabled={busy !== null}
          /*
           * ★목록을 먼저 복사하고 나서 비운다★ (실사고 2026-09-10 — 접수 ZIP 이 같은
           * 모양으로 깨져 있었다). `input.value = ''` 는 `e.target.files` 가 돌려준 ★그★
           * FileList 를 비운다 — 참조만 쥐고 있으면 빈 목록을 읽는다. 여기서는 조용히
           * 넘어가지도 않고 「사진이나 PDF 를 넣어주세요」라는 ★틀린★ 말이 떴다.
           */
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = '';
            void take(picked);
          }}
        />
        {dragging && !busy && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed text-small font-bold transition ${
              over ? 'border-brand-500 bg-brand-50/95 text-brand-800' : 'border-slate-300 bg-white/90 text-slate-500'
            }`}
          >
            여기에 사진·PDF 를 놓기
          </div>
        )}
        <h2 className="text-base font-black tracking-[-0.02em] text-slate-900">사진 넣기</h2>
        <p className="mt-0.5 text-small leading-relaxed text-slate-500">
          찍은 서류 사진을 넣으면 종이만 잘라 반듯하게 펴고, 그림자를 걷어 스캔본처럼 만듭니다.
          ★사진으로 만든 PDF 도 됩니다★ — 장마다 갈라서 받습니다. 여러 장은 한 PDF 로 묶입니다.
        </p>
        <span className="mt-3 inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white">
          {busy ?? '사진·PDF 고르기 · 끌어다 놓기'}
        </span>
      </label>
      <Err className="block">{error}</Err>

      {shot && (
        <>
          <section className={`${PANEL} p-5`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-h3 font-black text-slate-900">네 귀퉁이 맞추기</h2>
                <span className="text-small font-bold tabular-nums text-slate-400">
                  {at + 1}/{shots.length}
                </span>
                <span className="text-tiny text-slate-400">{shot.name}</span>
              </div>
              <Btn
                size="sm"
                kind="quiet"
                onClick={() => {
                  setShots((prev) => prev.filter((_, i) => i !== at));
                  setAt((i) => Math.max(0, i - 1));
                }}
              >
                이 장 빼기
              </Btn>
            </div>

            <QuadEditor
              shot={shot}
              onChange={(quad) => setShots((prev) => prev.map((s, i) => (i === at ? { ...s, quad } : s)))}
            />

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Btn size="sm" kind="side" disabled={at === 0} onClick={() => setAt((i) => i - 1)}>
                이전 장
              </Btn>
              <Btn
                size="sm"
                kind="side"
                disabled={at >= shots.length - 1}
                onClick={() => setAt((i) => i + 1)}
              >
                다음 장
              </Btn>
              <Btn
                size="sm"
                kind="quiet"
                className="ml-auto"
                onClick={() =>
                  setShots((prev) =>
                    prev.map((s, i) => (i === at ? { ...s, quad: orderQuad(estimateQuad(s.bmp)) } : s)))
                }
              >
                자동으로 다시 잡기
              </Btn>
            </div>
          </section>

          <section className={`${PANEL} p-5`}>
            <h2 className="mb-3 text-h3 font-black text-slate-900">만들기</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {/*
                도장·서명이 빨간 서류가 있다(한백 2026-08-31) — 흑백으로 만들면 인감인지
                구별이 안 된다. 기본은 흑백(스캐너 느낌)이고, 그런 서류만 색을 살린다.
              */}
              <Choice on={mono} onClick={() => setMono(true)}>흑백</Choice>
              <Choice on={!mono} onClick={() => setMono(false)}>색 살리기</Choice>
              <Btn className="ml-auto" busy={busy !== null} busyLabel={busy ?? '만드는 중…'} onClick={() => void make()}>
                A4 PDF 로 받기 · {shots.length}장
              </Btn>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ── 네 점 끌기 ───────────────────────────────────────────────────────────
 * 사진을 캔버스에 그리고 그 위에 점 넷과 이은 선을 얹는다.
 *
 * ★점은 SVG 로 얹는다★ — 캔버스에 같이 그리면 끌 때마다 사진까지 다시 그려야 하고,
 * 어느 점을 잡았는지 좌표로 따져야 한다. SVG 로 두면 브라우저가 잡아 준다.
 * 좌표는 원본 화소 기준으로 들고, 화면 크기는 viewBox 가 맞춘다 — 창을 줄여도
 * 점이 어긋나지 않는다.
 */
function QuadEditor({ shot, onChange }: { shot: Shot; onChange: (q: Pt[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    cv.width = shot.bmp.width;
    cv.height = shot.bmp.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(asImageData(shot.bmp), 0, 0);
  }, [shot]);

  const { width: W, height: H } = shot.bmp;
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag === null) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    /* 그림 밖으로는 못 나간다 — 나가면 편 결과에 흰 삼각형이 생긴다 */
    const p = { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
    onChange(shot.quad.map((q, i) => (i === drag ? p : q)));
  };

  return (
    <div className="relative overflow-hidden rounded-box border border-slate-200 bg-slate-50">
      <canvas ref={canvas} className="block w-full" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <polygon
          points={shot.quad.map((p) => `${p.x},${p.y}`).join(' ')}
          className="fill-brand-500/15 stroke-brand-500"
          strokeWidth={Math.max(2, W / 300)}
        />
        {shot.quad.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={Math.max(8, W / 60)}
            className={`cursor-grab ${drag === i ? 'fill-brand-600' : 'fill-white'} stroke-brand-600`}
            strokeWidth={Math.max(2, W / 300)}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag(i);
            }}
          />
        ))}
      </svg>
    </div>
  );
}
