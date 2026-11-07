'use client';

import { useRef, useState } from 'react';
import { Btn, Err, FIELD, Tag } from '@/components/ui';
import type { ProposalTemplate } from '@/lib/data/solar-proposals';
import { dayOf } from '@/lib/date';
import { saveProposalTerms, uploadProposalTemplate } from '@/lib/solar/proposal/client';
import { missingTerms, TEMPLATE_KEYS, TEMPLATES, type TermField } from '@/lib/solar/proposal/products';
import { PANEL, TEXT } from './ui';

/** 조건 한 칸의 글 — 없으면 「—」, 0 이 콘솔 기본인 칸은 그 말 */
const termText = (f: TermField, v: unknown): string =>
  typeof v !== 'number' ? '—' : v === 0 && f.zeroText ? f.zeroText : `${v.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}${f.unit}`;

/**
 * 템플릿 · 조건 — 한백 관리자. 제안서를 짓는 흐름 밖, 제안서 생성 화면 맨 아래의 접힌 판이다(한백 2026-11-08 「UXUI도 best practice인지
 * 검토해봐. 너무 순서가 뒤죽박죽이야」 — 그전에는 제안서 칸 안, 만들기 단추 밑에 있었다). 템플릿마다 한 줄: 파일(올리기 · 바꾸기) · 조건(고치기).
 * 템플릿이 없거나 조건이 빈 줄의 수를 머리에 적는다 — 접어 둬도 고칠 것이 있는지 보인다.
 */
export default function ProposalTemplates({ templates, onChange }: { templates: ProposalTemplate[]; onChange: (t: ProposalTemplate) => void }) {
  const todo = templates.filter((t) => !t.file || missingTerms(t.key, t.terms).length > 0).length;
  return (
    <section className={PANEL} aria-label="템플릿 · 조건">
      <details>
        <summary className={`flex cursor-pointer flex-wrap items-baseline gap-x-2 px-5 py-3 ${TEXT.head}`}>
          템플릿 · 조건
          <span className={`${TEXT.meta} tabular-nums`}>{todo ? `채울 것 ${todo}개` : `${templates.length}개`}</span>
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 px-5">
          {TEMPLATE_KEYS.map((key) => (
            <TemplateRow key={key} template={templates.find((t) => t.key === key)!} onChange={onChange} />
          ))}
        </ul>
      </details>
    </section>
  );
}

function TemplateRow({ template, onChange }: { template: ProposalTemplate; onChange: (t: ProposalTemplate) => void }) {
  const def = TEMPLATES[template.key];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const upload = async (file: File) => {
    setError(null);
    setBusy('올리는 중…');
    try {
      onChange(await uploadProposalTemplate(template.key, file, (pct) => setBusy(`올리는 중 ${pct}%`)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const openTerms = () => {
    setDraft(Object.fromEntries(def.terms.map((f) => [f.key, typeof template.terms[f.key] === 'number' ? String(template.terms[f.key]) : ''])));
    setError(null);
    setEditing(true);
  };
  const saveTerms = async () => {
    setError(null);
    setBusy('저장 중…');
    try {
      onChange(await saveProposalTerms(template.key, draft));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const missing = missingTerms(template.key, template.terms);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={TEXT.item}>
          {def.company} {def.title}
        </span>
        {template.file ? (
          <span className={TEXT.label}>
            {template.file.name} · {dayOf(new Date(template.file.at))}
          </span>
        ) : (
          <Tag tone="warn">템플릿 없음</Tag>
        )}
        <input ref={fileRef} type="file" accept={def.file === 'pptx' ? '.pptx' : '.pdf'} className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <Btn size="sm" kind="quiet" onClick={() => fileRef.current?.click()} busy={busy?.startsWith('올리는') ?? false} busyLabel={busy ?? undefined}>
          {template.file ? '템플릿 바꾸기' : '템플릿 올리기'}
        </Btn>
        {!editing && (
          <Btn size="sm" kind="quiet" onClick={openTerms}>
            조건 고치기
          </Btn>
        )}
      </div>
      {!editing && (
        <p className={`mt-1 ${TEXT.body}`}>
          {missing.length === def.terms.length ? (
            <Tag tone="warn">조건 미지정</Tag>
          ) : (
            def.terms.map((f) => `${f.label} ${termText(f, template.terms[f.key])}`).join(' · ')
          )}
        </p>
      )}
      {editing && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {def.terms.map((f) => (
            <label key={f.key} className="block">
              <span className={TEXT.label}>
                {f.label} ({f.unit}
                {f.zeroText ? ` · 0 = ${f.zeroText}` : ''})
              </span>
              <input
                inputMode="decimal"
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className={`mt-1 tabular-nums ${FIELD}`}
              />
            </label>
          ))}
          <div className="flex items-center gap-2 sm:col-span-3">
            <Btn size="sm" onClick={() => void saveTerms()} busy={busy === '저장 중…'} busyLabel="저장 중…">
              저장
            </Btn>
            <Btn size="sm" kind="quiet" onClick={() => setEditing(false)}>
              취소
            </Btn>
          </div>
        </div>
      )}
      <Err className="mt-1 block">{error}</Err>
    </li>
  );
}
