'use client';

/**
 * 머리말 사실 줄에서 고칠 수 있는 칸.
 *
 * ★왜 사실 줄 안에 두는가★
 * 영업사·시공사·환경부 대기번호는 운영사·대수·계약연수와 같은 급의 사실이다. 아래에
 * 따로 상자를 두면 같은 것을 두 군데서 읽어야 하고, 머리말이 두 층으로 길어진다.
 *
 * ★그래도 고칠 수 있어야 한다★
 *   영업사·시공사 — 협력사가 자기 현장을 보는 판정이 이 문자열의 일치다. 오타 하나면
 *     그 업체에게 그 현장이 영구히 안 보인다.
 *   환경부 대기번호 — 접수 뒤에 환경부에서 오는 값이라 한백이 나중에 넣는다.
 *
 * 평소에는 글자로 굳어 있다. 늘 열린 입력칸으로 두면 옆을 지나가는 클릭에 값이 바뀐다.
 * 고치려면 「고치기」를 눌러야 하고, 그때만 이 칸이 한 줄을 통째로 쓴다 — 좁은 칸에
 * 입력창을 끼우면 긴 업체 이름이 눌린다.
 *
 * 협력사에게는 「고치기」가 없다. 못 하는 일은 눌리지 않게 한다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';
import { Btn, Empty, Err, FIELD, Picks, Val } from '@/components/ui';

export function EditableFact({
  label, value, canEdit, url, field, method = 'PATCH', empty = '—', placeholder,
  suggestions = [], na = false, row = false, editValue, numeric = false,
}: {
  label: string;
  value: string | null;
  canEdit: boolean;
  url: string;
  /** 보낼 본문의 키 — { [field]: 값 } 으로 나간다 */
  field: string;
  method?: 'POST' | 'PATCH';
  /** 값이 없을 때 보여줄 말. 비어 있음이 문제인 칸은 「미지정」처럼 눈에 띄게 적는다. */
  empty?: string;
  placeholder?: string;
  /** 눌러 넣을 후보 — 손으로 적으면 「에코일렉」과 「에코일렉 」이 갈린다 */
  suggestions?: string[];
  /**
   * 이 현장에는 해당없는 칸인가.
   *
   * 칸을 없애지 않는다 — 「빠뜨린 것」과 「원래 해당없는 것」은 다른 것이고,
   * 칸이 사라지면 둘이 같은 모양이 된다(서류 목록에서 해당없음 칸을 남기는 것과 같은 이유).
   * 고치는 자리는 주지 않는다 — 못 하는 일은 눌리지 않게 한다.
   */
  na?: boolean;
  /**
   * 줄 모양 — 라벨이 값 ★왼쪽★에 서는 배치 (현장 정보의 FactGroup 이 그렇다).
   *
   * 머리말은 라벨을 값 ★위★에 쌓는다(칸이 좁고 값이 크게 읽혀야 한다). 현장 정보는
   * 한 상자에 여섯 줄이 늘어서는 자리라 라벨이 한 열에 서야 훑어진다 — 그 상자만
   * 고치는 자리를 못 갖고 있었던 이유가 배치가 달라서였다. 배치를 자리에서 적지 않고
   * 여기 둔다(화면 규칙 — 없는 모양은 부품에 추가한다).
   *
   * ★고치는 중에는 두 배치가 같다★ — 입력칸·후보·단추가 한 줄을 통째로 쓴다.
   */
  row?: boolean;
  /**
   * 입력칸에 처음 들어갈 글자 — 안 주면 value 를 쓴다.
   *
   * ★보여주는 값과 고치는 값이 다른 칸이 있다★ — 「6대」·「728면」·「7년」처럼 단위를
   * 붙여 읽히는 자리다. 그대로 입력칸에 넣으면 사람이 단위를 지우고 쳐야 하고, 안 지우면
   * 서버가 거절한다. 단위는 읽는 사람 것이고 고치는 것은 숫자다.
   */
  editValue?: string;
  /**
   * 숫자로 보내는가 — 서버가 정수만 받는 칸(대수·연수·주차면수).
   *
   * 안 주면 글자로 나간다. ★타입은 이것을 안 잡아준다★ — 본문이 JSON 이라 "6" 과 6 이
   * 모양이 같고, 서버는 Number.isInteger 로 걸러 「1 이상의 정수여야 합니다」를 돌려준다.
   * 숫자가 아닌 글자는 여기서 막는다 — 왕복하지 않고 그 자리에서 말한다(화면 규칙 9).
   */
  numeric?: boolean;
}) {
  const { busy, error, setError, run } = useAction();
  const [editing, setEditing] = useState(false);
  /** 입력칸이 여는 값 — 단위가 붙은 표시값이 아니라 고치는 값이다 */
  const seed = editValue ?? value ?? '';
  const [draft, setDraft] = useState(seed);

  async function save(next: string) {
    const trimmed = next.trim();
    if (numeric && trimmed !== '' && !/^\d+$/.test(trimmed)) {
      setError('숫자만 넣어주세요.');
      return;
    }
    const ok = await run({
      url,
      method,
      body: { [field]: trimmed === '' ? null : numeric ? Number(trimmed) : trimmed },
      fail: '수정하지 못했습니다.',
    });
    if (ok) setEditing(false);
  }

  const close = () => {
    setEditing(false);
    setDraft(seed);
    setError(null);
  };

  if (na) {
    return row ? (
      <div className="flex items-baseline gap-2">
        <dt className="w-20 shrink-0 text-tiny font-bold text-slate-400">{label}</dt>
        <dd className="min-w-0"><Empty kind="na" /></dd>
      </div>
    ) : (
      <div className="min-w-0">
        <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
        <dd className="mt-0.5"><Empty kind="na" /></dd>
      </div>
    );
  }

  // 고칠 때는 격자의 한 칸이 아니라 한 줄을 통째로 쓴다 — 좁은 칸에 입력창·후보가 눌린다
  if (editing) {
    return (
      <div className="col-span-full flex w-full flex-col gap-1.5 py-1">
        <dt className="text-micro font-bold tracking-[0.04em] text-slate-400">{label}</dt>
        <dd className="flex flex-col gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(draft);
              if (e.key === 'Escape') close();
            }}
            className={`${FIELD} max-w-[280px]`}
          />
          <Picks options={suggestions} onPick={setDraft} />
          <div className="flex items-center gap-1.5">
            <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={() => void save(draft)}>
              저장
            </Btn>
            <Btn size="sm" kind="quiet" disabled={busy} onClick={close}>
              취소
            </Btn>
            <Err>{error}</Err>
          </div>
        </dd>
      </div>
    );
  }

  /*
   * 줄 모양 — 라벨이 왼쪽 한 열에 서고, 값과 「수정」이 그 오른쪽에 붙는다.
   * 빈 값은 노랑(미지정)이 아니라 「—」다: 담당자·연락처는 없어도 되는 값이라
   * 「빠뜨렸다」가 아니다(화면 규칙 10 — 네 가지 빈 값은 서로 다른 말이다).
   */
  if (row) {
    return (
      <div className="flex items-baseline gap-2">
        <dt className="w-20 shrink-0 text-tiny font-bold text-slate-400">{label}</dt>
        <dd className="flex min-w-0 flex-wrap items-baseline gap-1.5 break-keep">
          <span className={`text-small font-semibold ${value ? 'text-slate-800' : 'text-slate-300'}`}>
            {value ?? empty}
          </span>
          {canEdit && (
            <Btn size="sm" kind="quiet" onClick={() => { setDraft(seed); setEditing(true); }}>
              {value ? '수정' : '입력'}
            </Btn>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <dt className="text-tiny font-bold tracking-[0.04em] text-slate-400">{label}</dt>
      {/* 고치는 칩은 값 옆에 붙는다 — 라벨 줄에 두면 라벨이 값보다 길어져 열이 어긋난다 */}
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-1.5 break-keep">
        {/* 비어 있음은 「빠뜨린 것」이라 노랑이다 — 아직 올 때가 아닌 것(—)과 다른 말이다 */}
        {value ? <Val value={value} /> : <Empty kind="miss" label={empty === '—' ? undefined : empty} />}
        {canEdit && (
          <Btn size="sm" kind="quiet" onClick={() => { setDraft(seed); setEditing(true); }}>
            {value ? '수정' : '입력'}
          </Btn>
        )}
      </dd>
    </div>
  );
}
