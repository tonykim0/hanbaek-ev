'use client';

/**
 * 나이스인프라 실사보고서 — 사전 현장 컨설팅 사진 대장.
 * 서식은 SK 양식 한 벌이다(public/survey/ledger.docx · lib/survey/fill-ledger). ★나이스도 이 양식을
 * 쓴다★ — 표준 양식이 없어서(한백 지시 2026-10-01).
 */
import SurveyEditor from '@/components/survey/SurveyEditor';
import { ContractPageShell } from '@/components/contracts/PageChrome';
import { fillLedgerSurvey, ledgerSurveyFileName } from '@/lib/survey/fill-ledger';
import { LEDGER_PHOTO_SLOTS } from '@/lib/survey/spec';

export default function NiceSurveyPage() {
  return (
    <ContractPageShell title="나이스인프라 실사보고서 (사진 대장)" back={{ href: '/#survey', label: '← 실사보고서 작성' }}>
      <SurveyEditor
        cpo="nice"
        slots={LEDGER_PHOTO_SLOTS}
        variant="ledger"
        fileName={ledgerSurveyFileName}
        build={async (form, images) => {
          const res = await fetch('/survey/ledger.docx');
          if (!res.ok) throw new Error(`서식을 불러오지 못했습니다 (${res.status})`);
          return (await fillLedgerSurvey(form, images, await res.arrayBuffer())) as Blob;
        }}
      />
    </ContractPageShell>
  );
}
