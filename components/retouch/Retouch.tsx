'use client';

/**
 * 서류 문구 수정 — 스캔본을 올리고 무엇을 고칠지 적으면, 그 글자만 같은 모양으로 바꾼 PDF 를 받는다.
 *
 * 차례 셋: 올린다 → 적고 「찾기」(판독이 고칠 자리를 짚는다) → 쪽 그림에서 확인·조절하고 「PDF 받기」.
 * 원본도 결과도 우리 저장소에 남지 않는다 — 판독에 보내는 작은 쪽 그림과, 받을 때의 감사 기록(무엇을 무엇으로)뿐이다.
 * ★기록이 안 남으면 받지 않는다★ — 직인사용동의로 고쳐 낸 서류의 근거가 그 기록이다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Choice, Err, FIELD, PANEL, TEXT } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { buildPdf, MAX_PAGES, openDoc, previewJpeg, type OpenedDoc } from '@/lib/retouch/doc';
import { ensureFonts, guessWeight, paintEdits, type Edit, type FontKey, type Raster } from '@/lib/retouch/paint';
import type { LocateResult } from '@/lib/retouch/types';
import EditCard from './EditCard';
import PageView, { type Shown } from './PageView';

/** 판독에 보내는 크기 — 요청 본문 한도(4.5MB) 안에 12쪽이 들게. 넘치면 한 번 더 줄인다 */
const SEND = [{ side: 1600, q: 0.75 }, { side: 1200, q: 0.7 }];
const SEND_BUDGET = 3_600_000;

interface Loaded { raster: Raster; base: HTMLCanvasElement }

function baseOf(r: Raster): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = r.width; cv.height = r.height;
  cv.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return cv;
}

export default function Retouch({ fonts }: { fonts: Record<FontKey, string> }) {
  const [doc, setDoc] = useState<OpenedDoc | null>(null);
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [finding, setFinding] = useState(false);
  const [findErr, setFindErr] = useState<string | null>(null);
  const [found, setFound] = useState<Pick<LocateResult, 'docKind' | 'note'> | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [loaded, setLoaded] = useState<Map<number, Loaded>>(new Map());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [painted, setPainted] = useState<Map<string, Shown>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const docRef = useRef<OpenedDoc | null>(null);

  useEffect(() => () => docRef.current?.close(), []);
  /* 고른 쪽을 아직 안 구웠으면 그때 굽는다 — 열 쪽을 다 원본 해상도로 쥐고 있지 않게 */
  useEffect(() => {
    if (!doc || !found || loaded.has(page)) return;
    let live = true;
    const next = new Map(loaded);
    void load(doc, page, next).then(() => { if (live) setLoaded(next); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, found, page]);
  useLeaveGuard(edits.length > 0 && !taken, '고친 서류를 아직 받지 않았습니다. 나가시겠습니까?');

  const pages = useMemo(() => [...new Set(edits.map((e) => e.page))].sort((a, b) => a - b), [edits]);
  const here = loaded.get(page);
  const pageEdits = useMemo(() => edits.filter((e) => e.page === page), [edits, page]);

  async function take(file: File | undefined) {
    if (!file || opening) return;
    setOpening(true);
    setOpenErr(null);
    try {
      const next = await openDoc(file);
      docRef.current?.close();
      docRef.current = next;
      setDoc(next);
      setEdits([]); setLoaded(new Map()); setFound(null); setFindErr(null); setSaveErr(null); setTaken(false);
    } catch (err) {
      setOpenErr(err instanceof Error ? err.message : '서류를 열지 못했습니다.');
    } finally {
      setOpening(false);
    }
  }

  async function load(d: OpenedDoc, n: number, into: Map<number, Loaded>) {
    if (into.has(n)) return;
    const raster = await d.render(n, d.pages[n - 1].pxPerPt);
    into.set(n, { raster, base: baseOf(raster) });
  }

  async function find() {
    if (!doc || !prompt.trim()) return;
    setFinding(true);
    setFindErr(null);
    try {
      let sent: Awaited<ReturnType<typeof previewJpeg>>[] = [];
      for (const { side, q } of SEND) {
        sent = [];
        for (let n = 1; n <= doc.pages.length; n += 1) sent.push(await previewJpeg(doc, n, side, q));
        if (sent.reduce((s, p) => s + p.image.length, 0) <= SEND_BUDGET) break;
      }
      const res = await fetch('/api/retouch/locate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, pages: sent }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<LocateResult> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? '고칠 자리를 찾지 못했습니다.');
      const located = data.edits ?? [];
      const next = new Map(loaded);
      for (const n of new Set(located.map((e) => e.page))) await load(doc, n, next);
      const stamp = Date.now();
      const made: Edit[] = located.map((e, i) => {
        const r = next.get(e.page)!.raster;
        const k = r.width / sent[e.page - 1].width;
        return {
          id: `${stamp}-${i}`, page: e.page,
          box: { x: e.box.x0 * k, y: e.box.y0 * k, w: (e.box.x1 - e.box.x0) * k, h: (e.box.y1 - e.box.y0) * k },
          original: e.original, replacement: e.replacement,
          font: e.serif ? 'serif' : 'sans', weight: e.bold ? 700 : 400, align: e.align,
          scale: 1, dx: 0, dy: 0,
        };
      });
      /* 굵기는 판독의 「굵다/아니다」가 아니라 원본 획의 밀도로 고른다 */
      await ensureFonts(fonts, made, true);
      const weighed = made.map((e) => ({ ...e, weight: guessWeight(next.get(e.page)!.raster, e, fonts) }));
      setLoaded(next);
      setEdits(weighed);
      setFound({ docKind: data.docKind ?? '서류', note: data.note ?? null });
      setPage(made[0]?.page ?? 1);
      setSelected(weighed[0]?.id ?? null);
      setTaken(false);
    } catch (err) {
      setFindErr(err instanceof Error ? err.message : '고칠 자리를 찾지 못했습니다.');
    } finally {
      setFinding(false);
    }
  }

  async function addBox() {
    if (!doc) return;
    const next = new Map(loaded);
    await load(doc, page, next);
    const r = next.get(page)!.raster;
    const ed: Edit = {
      id: `${Date.now()}-add`, page,
      box: { x: r.width * 0.45, y: r.height * 0.49, w: r.width * 0.1, h: r.height * 0.02 },
      original: '', replacement: '', font: 'sans', weight: 400, align: 'left', scale: 1, dx: 0, dy: 0,
    };
    setLoaded(next);
    setEdits((prev) => [...prev, ed]);
    setSelected(ed.id);
    setTaken(false);
  }

  const patch = (id: string, p: Partial<Edit>) => {
    setEdits((prev) => prev.map((e) => (e.id === id ? { ...e, ...p } : e)));
    setTaken(false);
  };

  async function save() {
    if (!doc || edits.length === 0) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await ensureFonts(fonts, edits);
      const canvases = new Map<number, HTMLCanvasElement>();
      for (const n of pages) {
        const l = loaded.get(n);
        if (!l) continue;
        const cv = document.createElement('canvas');
        cv.width = l.raster.width; cv.height = l.raster.height;
        const ctx = cv.getContext('2d');
        if (!ctx) throw new Error('그림판을 만들지 못했습니다.');
        ctx.drawImage(l.base, 0, 0);
        const done = paintEdits(ctx, l.raster, edits.filter((e) => e.page === n), fonts, doc.pages[n - 1].mono);
        const stuck = [...done.values()].find((p) => p.problem);
        if (stuck) throw new Error(`${n}쪽 — ${stuck.problem}`);
        canvases.set(n, cv);
      }
      const blob = await buildPdf(doc, canvases);
      const log = await fetch('/api/retouch/log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file: doc.name, prompt,
          edits: edits.map((e) => ({ page: e.page, from: e.original, to: e.replacement })),
        }),
      });
      if (!log.ok) {
        const d = (await log.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? '기록을 남기지 못해 받지 않았습니다.');
      }
      downloadBlob(blob, `${doc.name.replace(/\.[^.]+$/, '')}_수정.pdf`);
      setTaken(true);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'PDF 를 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <label className={`block rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-5 ${opening ? 'opacity-60' : 'cursor-pointer'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files[0]); }}
      >
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={opening}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void take(f); }}
        />
        <span className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white">
          {opening ? '여는 중…' : doc ? '다른 서류 고르기' : `서류 고르기 · PDF ${MAX_PAGES}쪽까지 · JPG · PNG`}
        </span>
        {doc && <span className={`ml-3 ${TEXT.body}`}>{doc.name} · {doc.pages.length}쪽</span>}
      </label>
      <Err className="block">{openErr}</Err>

      {doc && (
        <section className={`${PANEL} p-5`}>
          <h2 className={`mb-2 ${TEXT.section}`}>무엇을 고칠까요</h2>
          <textarea
            className={`${FIELD} min-h-[72px]`}
            value={prompt}
            placeholder="예: 계약대수 3대를 2대로 · 2쪽 계약일 2026년 10월 1일을 10월 15일로"
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Btn busy={finding} busyLabel="찾는 중…" disabled={!prompt.trim()} onClick={() => void find()}>
              {prompt.trim() ? '고칠 자리 찾기' : '고칠 내용 없음 — 찾기 불가'}
            </Btn>
            <Err>{findErr}</Err>
            {found && <span className={TEXT.meta}>{found.docKind} · {edits.length}곳</span>}
          </div>
          {found?.note && <p className={`mt-2 ${TEXT.body}`}>{found.note}</p>}
        </section>
      )}

      {doc && found && (
        <section className={`${PANEL} p-5`}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <h2 className={`mr-2 ${TEXT.section}`}>확인</h2>
            {doc.pages.map((_, i) => (
              <Choice key={i} on={page === i + 1} onClick={() => setPage(i + 1)}>
                {i + 1}쪽{pages.includes(i + 1) ? ` · ${edits.filter((e) => e.page === i + 1).length}` : ''}
              </Choice>
            ))}
            <Btn size="sm" kind="quiet" onClick={() => void addBox()}>상자 더하기</Btn>
            <div className="ml-auto flex items-center gap-2">
              <Err>{saveErr}</Err>
              <Btn busy={saving} busyLabel="만드는 중…" disabled={edits.length === 0} onClick={() => void save()}>
                {edits.length === 0 ? '고칠 자리 0곳 — 받기 불가' : taken ? '다시 받기' : 'PDF 받기'}
              </Btn>
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              {here ? (
                <PageView
                  raster={here.raster}
                  base={here.base}
                  edits={pageEdits}
                  fonts={fonts}
                  mono={doc.pages[page - 1].mono}
                  selected={selected}
                  onSelect={setSelected}
                  onBox={(id, box) => patch(id, { box })}
                  onPainted={setPainted}
                />
              ) : (
                <span className={TEXT.meta}>쪽을 굽는 중…</span>
              )}
            </div>
            <ul className="flex flex-col divide-y divide-slate-100 lg:w-[22rem] lg:shrink-0">
              {pageEdits.map((e) => (
                <EditCard
                  key={e.id}
                  edit={e}
                  painted={painted.get(e.id)}
                  selected={selected === e.id}
                  onSelect={() => setSelected(e.id)}
                  onChange={(p) => patch(e.id, p)}
                  onRemove={() => setEdits((prev) => prev.filter((x) => x.id !== e.id))}
                />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
