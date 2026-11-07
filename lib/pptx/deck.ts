/**
 * 있는 파워포인트(pptx) 고치기 — 슬라이드의 모양을 이름으로 찾아 글을 바꾸고, 그림을 갈고, 모양을 빼고 더한다.
 *
 * 사업자가 준 틀(타이런트 솔라15 · 에이치에너지 솔라쉐어 2.0)과 PDF 에서 지은 틀(루모라, lib/pptx/build)을 같은 길로 채운다.
 * 모양은 이름(cNvPr name)으로 찾는다 — 사업자가 틀을 바꿔 그 이름이 없으면 채우지 않고 멈춘다(엉뚱한 칸에 넣지 않게).
 * DOMParser · XMLSerializer 만 쓴다 — 브라우저에서 돈다(docx-kit 과 같다).
 */
import JSZip from 'jszip';
import { parseXml } from '@/lib/survey/xml-safe';
import { A_NS, P_NS, R_NS } from './xml';

const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const P14_NS = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

const ser = (d: Document) => new XMLSerializer().serializeToString(d);
/** 내용의 SHA-256(16진) — 브라우저 · node 둘 다의 Web Crypto */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
/** 'ppt/slides/slide2.xml' 기준 상대 경로 '../media/image3.png' → 'ppt/media/image3.png' */
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
const relsPathOf = (part: string) => part.replace(/([^/]+)$/, '_rels/$1.rels');

/**
 * 차례에서 걷은 슬라이드를 묶음에서 지울 때 같이 지울 자리 — 그 장과 (있으면) 그 메모 장, 둘의 관계 파일, 둘만 쓰던 그림. [순수]
 * 레이아웃 · 마스터 · 다른 장도 쓰는 그림은 남긴다. 다른 부품이 그 장을 가리키면(다른 장의 하이퍼링크 등) 아무것도 지우지 않는다 —
 * 가리키는 곳이 사라지면 그쪽이 깨진다.
 * targets: 관계 파일 자리 → 그 대상 부품 자리들(차례에서 걷은 뒤의 묶음 — 프레젠테이션은 그 장을 더 가리키지 않는다).
 */
export function orphansOf(part: string, targets: ReadonlyMap<string, readonly string[]>): string[] {
  const own = [part, ...(targets.get(relsPathOf(part)) ?? []).filter((t) => /\/notesSlides\/[^/]+\.xml$/.test(t))];
  const ownRels = own.map(relsPathOf);
  const usedElsewhere = (path: string) => Array.from(targets).some(([relFile, ts]) => !ownRels.includes(relFile) && ts.includes(path));
  if (usedElsewhere(part)) return [];
  const media = new Set(own.flatMap((p) => targets.get(relsPathOf(p)) ?? []).filter((t) => t.startsWith('ppt/media/')));
  return [...own, ...ownRels.filter((r) => targets.has(r)), ...Array.from(media).filter((m) => !usedElsewhere(m))];
}

export class Slide {
  private dirty = false;
  constructor(
    private readonly deck: Deck,
    readonly part: string,
    readonly doc: Document,
    readonly rels: Document,
  ) {}

  /** 모양 묶음(spTree) — 새 모양은 여기 끝에 붙는다(맨 위에 그려진다) */
  get tree(): Element {
    const t = this.doc.getElementsByTagNameNS(P_NS, 'spTree')[0];
    if (!t) throw new Error(`${this.part} 에 모양 묶음이 없습니다.`);
    return t;
  }

  /** 이름이 name 인 모양(sp · pic · graphicFrame · grpSp) — 없으면 null */
  find(name: string): Element | null {
    const all = this.doc.getElementsByTagNameNS(P_NS, 'cNvPr');
    for (let i = 0; i < all.length; i++) {
      if (all[i].getAttribute('name') === name) return all[i].parentNode!.parentNode as Element;
    }
    return null;
  }

  shape(name: string): Element {
    const el = this.find(name);
    if (!el) throw new Error(`템플릿이 바뀌었습니다 — ${this.label}에 「${name}」 칸이 없습니다.`);
    return el;
  }

  get label(): string {
    const n = this.deck.slides.indexOf(this.part) + 1;
    return `${n}번째 슬라이드`;
  }

  /** 다음 모양 번호 — 한 슬라이드 안에서 겹치면 파워포인트가 「복구」를 묻는다 */
  nextId(): number {
    let max = 1;
    const all = this.doc.getElementsByTagNameNS(P_NS, 'cNvPr');
    for (let i = 0; i < all.length; i++) max = Math.max(max, Number(all[i].getAttribute('id')) || 0);
    return max + 1;
  }

  /**
   * 그 모양의 글을 바꾼다 — 첫 덩이의 덩이 모양(pPr)과 첫 토막의 글자 모양(rPr)을 그대로 두고 글만. 줄바꿈(\n)마다 덩이를 나눈다.
   * 틀의 견본 글(「000 kW」)이 지닌 글꼴 · 크기 · 색이 그대로 남는다.
   */
  setText(name: string, text: string, opts: { size?: number } = {}): void {
    const sp = this.shape(name);
    const body = sp.getElementsByTagNameNS(P_NS, 'txBody')[0];
    if (!body) throw new Error(`${this.label}의 「${name}」은 글을 받는 칸이 아닙니다.`);
    const ps = Array.from(body.getElementsByTagNameNS(A_NS, 'p'));
    const first = ps[0];
    const pPr = first?.getElementsByTagNameNS(A_NS, 'pPr')[0] ?? null;
    const rPr = (first?.getElementsByTagNameNS(A_NS, 'rPr')[0] ?? first?.getElementsByTagNameNS(A_NS, 'endParaRPr')[0] ?? null) as Element | null;
    for (const p of ps) body.removeChild(p);
    for (const line of text.split('\n')) {
      const p = this.doc.createElementNS(A_NS, 'a:p');
      if (pPr) p.appendChild(pPr.cloneNode(true));
      const r = this.doc.createElementNS(A_NS, 'a:r');
      if (rPr || opts.size) {
        const rp = this.doc.createElementNS(A_NS, 'a:rPr');
        for (const a of Array.from(rPr?.attributes ?? [])) rp.setAttribute(a.name, a.value);
        for (const c of Array.from(rPr?.childNodes ?? [])) rp.appendChild(c.cloneNode(true));
        // 글이 칸보다 길면 글자를 줄여 넣는다(받는 쪽이 정한 크기 — 1/100 pt)
        if (opts.size) rp.setAttribute('sz', String(Math.round(opts.size * 100)));
        r.appendChild(rp);
      }
      const t = this.doc.createElementNS(A_NS, 'a:t');
      t.textContent = line;
      r.appendChild(t);
      p.appendChild(r);
      body.appendChild(p);
    }
    this.dirty = true;
  }

  /**
   * 그 모양의 그림(pic 의 그림 · sp 의 그림 채우기)을 바꾼다 — 새 그림을 매체 자리에 더하고 그 모양의 관계만 그리로 돌린다
   * (같은 그림을 다른 슬라이드가 쓰고 있어도 그쪽은 그대로다). 그림은 자리 비율로 이미 잘라 온다 — 자르기 칸(srcRect)은 걷는다.
   */
  setPicture(name: string, bytes: Uint8Array, ext: 'jpeg' | 'png'): void {
    const sp = this.shape(name);
    const blip = sp.getElementsByTagNameNS(A_NS, 'blip')[0];
    if (!blip) throw new Error(`${this.label}의 「${name}」은 그림 자리가 아닙니다.`);
    const rid = this.addMedia(bytes, ext);
    blip.setAttributeNS(R_NS, 'r:embed', rid);
    // 사진 효과 · 자르기는 견본 그림에 맞춘 것이라 걷는다
    while (blip.firstChild) blip.removeChild(blip.firstChild);
    const fillEl = blip.parentNode as Element;
    const src = fillEl.getElementsByTagNameNS(A_NS, 'srcRect')[0];
    if (src) fillEl.removeChild(src);
    if (!fillEl.getElementsByTagNameNS(A_NS, 'stretch')[0]) {
      const st = this.doc.createElementNS(A_NS, 'a:stretch');
      st.appendChild(this.doc.createElementNS(A_NS, 'a:fillRect'));
      fillEl.appendChild(st);
    }
    this.dirty = true;
  }

  /** 새 그림을 이 슬라이드의 관계에 더하고 그 번호(rId)를 준다 */
  addMedia(bytes: Uint8Array, ext: 'jpeg' | 'png'): string {
    const path = this.deck.addMediaFile(bytes, ext);
    const root = this.rels.documentElement;
    const used = new Set(Array.from(root.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')).map((r) => r.getAttribute('Id')));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n++;
    const rel = this.rels.createElementNS(PKG_REL_NS, 'Relationship');
    rel.setAttribute('Id', `rId${n}`);
    rel.setAttribute('Type', IMAGE_REL);
    rel.setAttribute('Target', `../media/${path.split('/').pop()}`);
    root.appendChild(rel);
    this.dirty = true;
    return `rId${n}`;
  }

  /** 모양을 뺀다 */
  remove(name: string): Element {
    const el = this.shape(name);
    el.parentNode!.removeChild(el);
    this.dirty = true;
    return el;
  }

  /** 그 모양 글의 크기(pt) — 첫 토막(없으면 덩이 끝)의 sz. 적힌 것이 없으면 null(물려받는 크기) */
  fontSizeOf(name: string): number | null {
    const sp = this.shape(name);
    for (const tag of ['rPr', 'endParaRPr']) {
      const el = sp.getElementsByTagNameNS(A_NS, tag)[0];
      const sz = el?.getAttribute('sz');
      if (sz) return Number(sz) / 100;
    }
    return null;
  }

  /** 모양의 자리(EMU) — 그 자리에 새 것을 얹을 때 */
  boxOf(name: string): { x: number; y: number; w: number; h: number } {
    const el = this.shape(name);
    // a:ext 는 이름표의 확장 칸(a:extLst/a:ext — 만든 번호)에도 있다 — 자리 칸(xfrm)의 자식만 본다
    const xfrm = el.getElementsByTagNameNS(A_NS, 'xfrm')[0] ?? el.getElementsByTagNameNS(P_NS, 'xfrm')[0];
    const kid = (local: string) => Array.from(xfrm?.childNodes ?? []).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === local);
    const off = kid('off');
    const ext = kid('ext');
    if (!off || !ext) throw new Error(`${this.label}의 「${name}」에 자리가 없습니다.`);
    return { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), w: Number(ext.getAttribute('cx')), h: Number(ext.getAttribute('cy')) };
  }

  /** 모양의 자리를 바꾼다(EMU) */
  setBox(name: string, box: { x: number; y: number; w: number; h: number }): void {
    const el = this.shape(name);
    const xfrm = el.getElementsByTagNameNS(A_NS, 'xfrm')[0] ?? el.getElementsByTagNameNS(P_NS, 'xfrm')[0];
    const kid = (local: string) => Array.from(xfrm?.childNodes ?? []).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === local);
    const off = kid('off');
    const ext = kid('ext');
    if (!off || !ext) throw new Error(`${this.label}의 「${name}」에 자리가 없습니다.`);
    off.setAttribute('x', String(Math.round(box.x)));
    off.setAttribute('y', String(Math.round(box.y)));
    ext.setAttribute('cx', String(Math.round(box.w)));
    ext.setAttribute('cy', String(Math.round(box.h)));
    this.dirty = true;
  }

  /**
   * XML 글로 지은 모양(lib/pptx/xml)을 붙인다 — 맨 위에(나중에 그려진다), 또는 before 라는 모양 바로 밑에(그 모양이 위로 온다).
   */
  append(xml: string, before?: string): void {
    const frag = parseXml(`<root xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">${xml}</root>`);
    const ref = before ? this.shape(before) : null;
    for (const node of Array.from(frag.documentElement.childNodes)) {
      if (node.nodeType !== 1) continue;
      const el = this.doc.importNode(node, true);
      if (ref) ref.parentNode!.insertBefore(el, ref);
      else this.tree.appendChild(el);
    }
    this.dirty = true;
  }

  flush(zip: JSZip): void {
    if (!this.dirty) return;
    zip.file(this.part, ser(this.doc));
    zip.file(relsPathOf(this.part), ser(this.rels));
    this.dirty = false;
  }
}

export class Deck {
  /** 슬라이드 차례대로의 자리('ppt/slides/slide1.xml') */
  slides: string[] = [];
  size = { cx: 0, cy: 0 };
  private readonly opened = new Map<string, Slide>();
  private mediaSeq = 0;

  private constructor(readonly zip: JSZip) {}

  static async open(data: ArrayBuffer | Uint8Array): Promise<Deck> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new Error('파워포인트 파일(pptx)이 아닙니다.');
    }
    const deck = new Deck(zip);
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!presXml || !relsXml) throw new Error('파워포인트 파일(pptx)이 아닙니다.');
    const pres = parseXml(presXml);
    const rels = parseXml(relsXml);
    const target = new Map(Array.from(rels.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
    const ids = pres.getElementsByTagNameNS(P_NS, 'sldId');
    for (let i = 0; i < ids.length; i++) deck.slides.push(resolve('ppt/presentation.xml', target.get(ids[i].getAttributeNS(R_NS, 'id') ?? ids[i].getAttribute('r:id')) ?? ''));
    const sz = pres.getElementsByTagNameNS(P_NS, 'sldSz')[0];
    deck.size = { cx: Number(sz?.getAttribute('cx')), cy: Number(sz?.getAttribute('cy')) };
    return deck;
  }

  /** n 번째 슬라이드(1부터) */
  async slide(n: number): Promise<Slide> {
    const part = this.slides[n - 1];
    if (!part) throw new Error(`템플릿이 바뀌었습니다 — ${n}번째 슬라이드가 없습니다(지금 ${this.slides.length}장).`);
    const hit = this.opened.get(part);
    if (hit) return hit;
    const xml = await this.zip.file(part)!.async('string');
    const relXml = (await this.zip.file(relsPathOf(part))?.async('string')) ?? `<Relationships xmlns="${PKG_REL_NS}"/>`;
    const s = new Slide(this, part, parseXml(xml), parseXml(relXml));
    this.opened.set(part, s);
    return s;
  }

  /** 매체 자리에 그림 파일을 더한다 — 이름은 겹치지 않게 hb-n */
  addMediaFile(bytes: Uint8Array, ext: 'jpeg' | 'png'): string {
    let path: string;
    do path = `ppt/media/hb-${++this.mediaSeq}.${ext}`;
    while (this.zip.file(path));
    this.zip.file(path, bytes);
    this.needsType.add(ext);
    return path;
  }
  private readonly needsType = new Set<string>();

  /** 열어서 고친 슬라이드를 묶음에 적어 둔다 — 묶음 전체의 관계를 읽기 전에(고친 관계가 아직 메모리에만 있으면 안 보인다) */
  private sync(): void {
    for (const s of this.opened.values()) s.flush(this.zip);
  }

  /** 묶음 안 모든 관계(.rels)의 대상 — 관계 파일 자리 → 대상 부품 자리들 */
  private async allTargets(): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const f of this.zip.file(/\.rels$/)) {
      // 'ppt/slides/_rels/slide2.xml.rels' 의 주인은 'ppt/slides/slide2.xml' · 묶음 뿌리의 '_rels/.rels' 는 뿌리 기준
      const owner = f.name === '_rels/.rels' ? '' : f.name.replace(/_rels\/([^/]+)\.rels$/, '$1');
      const doc = parseXml(await f.async('string'));
      out.set(
        f.name,
        Array.from(doc.getElementsByTagNameNS(PKG_REL_NS, 'Relationship'))
          .filter((r) => r.getAttribute('TargetMode') !== 'External')
          .map((r) => resolve(owner, r.getAttribute('Target') ?? '')),
      );
    }
    return out;
  }

  /**
   * 그 그림(내용의 SHA-256, 16진)을 쓰는 슬라이드의 차례들(1부터) — 그림 한 장으로 된 틀의 장을 차례가 아니라 내용으로 찾는다
   * (사업자가 장을 더하거나 빼 차례가 밀려도 엉뚱한 장을 짚지 않게).
   */
  async slidesUsing(sha256: string): Promise<number[]> {
    this.sync();
    const memo = new Map<string, string>();
    const hits: number[] = [];
    for (let i = 0; i < this.slides.length; i++) {
      const part = this.slides[i];
      const relXml = await this.zip.file(relsPathOf(part))?.async('string');
      if (!relXml) continue;
      for (const r of Array.from(parseXml(relXml).getElementsByTagNameNS(PKG_REL_NS, 'Relationship'))) {
        if (r.getAttribute('Type') !== IMAGE_REL || r.getAttribute('TargetMode') === 'External') continue;
        const path = resolve(part, r.getAttribute('Target') ?? '');
        let h = memo.get(path);
        if (h === undefined) {
          const bytes = await this.zip.file(path)?.async('uint8array');
          h = bytes ? await sha256Hex(bytes) : '';
          memo.set(path, h);
        }
        if (h === sha256) {
          hits.push(i + 1);
          break;
        }
      }
    }
    return hits;
  }

  /**
   * 슬라이드를 뺀다(1부터) — 차례 목록 · 관계 · 구역 · 맞춤 쇼에서 걷고, 그 장의 파일 · 메모 장 · 이제 아무 장도 안 쓰는 그림까지
   * 묶음에서 지운다(남겨 두면 파일이 그만큼 무겁고, 주인 없는 부품을 「복구」로 묻는 프로그램이 있다). 다른 부품이 그 장을
   * 가리키면(다른 장의 하이퍼링크 등) 파일은 남긴다 — 가리키는 곳이 사라지면 그쪽이 깨진다.
   */
  async dropSlide(n: number): Promise<void> {
    const part = this.slides[n - 1];
    if (!part) throw new Error(`${n}번째 슬라이드가 없습니다(지금 ${this.slides.length}장).`);
    this.sync();
    const pres = parseXml(await this.zip.file('ppt/presentation.xml')!.async('string'));
    const presRels = parseXml(await this.zip.file('ppt/_rels/presentation.xml.rels')!.async('string'));
    const rel = Array.from(presRels.getElementsByTagNameNS(PKG_REL_NS, 'Relationship')).find((r) => resolve('ppt/presentation.xml', r.getAttribute('Target') ?? '') === part);
    if (!rel) throw new Error(`${n}번째 슬라이드의 관계가 없습니다.`);
    const rid = rel.getAttribute('Id');
    const ridOf = (el: Element) => el.getAttributeNS(R_NS, 'id') || el.getAttribute('r:id');
    let numId: string | null = null;
    for (const s of Array.from(pres.getElementsByTagNameNS(P_NS, 'sldId'))) {
      if (ridOf(s) !== rid) continue;
      numId = s.getAttribute('id');
      s.parentNode!.removeChild(s);
    }
    // 구역(p14:sectionLst)은 슬라이드 번호로, 맞춤 쇼(p:custShowLst)는 관계로 그 장을 가리킨다 — 남으면 파워포인트가 「복구」를 묻는다
    for (const s of Array.from(pres.getElementsByTagNameNS(P14_NS, 'sldId'))) if (numId && s.getAttribute('id') === numId) s.parentNode!.removeChild(s);
    for (const s of Array.from(pres.getElementsByTagNameNS(P_NS, 'sld'))) if (ridOf(s) === rid) s.parentNode!.removeChild(s);
    rel.parentNode!.removeChild(rel);
    this.zip.file('ppt/presentation.xml', ser(pres));
    this.zip.file('ppt/_rels/presentation.xml.rels', ser(presRels));
    this.slides.splice(n - 1, 1);
    this.opened.delete(part);
    // 파일 속성의 장 수 — 파워포인트는 저장할 때 다시 쓰지만, 파인더 · 미리보기가 이 값을 보인다
    const app = await this.zip.file('docProps/app.xml')?.async('string');
    if (app) this.zip.file('docProps/app.xml', app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${this.slides.length}</Slides>`));

    const gone = new Set(orphansOf(part, await this.allTargets()));
    if (!gone.size) return;
    for (const p of gone) this.zip.remove(p);
    const ct = parseXml(await this.zip.file('[Content_Types].xml')!.async('string'));
    for (const o of Array.from(ct.getElementsByTagNameNS(CT_NS, 'Override'))) {
      if (gone.has((o.getAttribute('PartName') ?? '').replace(/^\//, ''))) o.parentNode!.removeChild(o);
    }
    this.zip.file('[Content_Types].xml', ser(ct));
  }

  /** 고친 것을 묶어 파일로 — 브라우저는 Blob, 시험(node)은 Uint8Array */
  async save(): Promise<Blob | Uint8Array> {
    for (const s of this.opened.values()) s.flush(this.zip);
    if (this.needsType.size) {
      const ct = parseXml(await this.zip.file('[Content_Types].xml')!.async('string'));
      const have = new Set(Array.from(ct.getElementsByTagNameNS(CT_NS, 'Default')).map((d) => (d.getAttribute('Extension') ?? '').toLowerCase()));
      for (const ext of this.needsType) {
        if (have.has(ext)) continue;
        const d = ct.createElementNS(CT_NS, 'Default');
        d.setAttribute('Extension', ext);
        d.setAttribute('ContentType', ext === 'png' ? 'image/png' : 'image/jpeg');
        ct.documentElement.insertBefore(d, ct.documentElement.firstChild);
      }
      this.zip.file('[Content_Types].xml', ser(ct));
    }
    const opts = { compression: 'DEFLATE' as const };
    return typeof window !== 'undefined'
      ? this.zip.generateAsync({ ...opts, type: 'blob', mimeType: PPTX_MIME })
      : this.zip.generateAsync({ ...opts, type: 'uint8array' });
  }
}
