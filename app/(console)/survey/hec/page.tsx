'use client';

/**
 * 현대엔지니어링 실사보고서(사진대지) 작성 — [별지 1] 사진대지 + [별지 2] 사전체크리스트.
 * 서식은 계약서 서식 안의 빈 별지다(lib/survey/fill-hec 머리말).
 */
import SurveyEditor from '@/components/survey/SurveyEditor';
import { ContractPageShell } from '@/components/contracts/PageChrome';
import { fillHecSurvey, hecSurveyFileName } from '@/lib/survey/fill-hec';
import { HEC_PHOTO_SLOTS } from '@/lib/survey/spec';

export default function HecSurveyPage() {
  return (
    <ContractPageShell title="현대엔지니어링 실사보고서 (사진대지)" back={{ href: '/survey', label: '← 운영사 다시 선택' }}>
      <SurveyEditor
        cpo="hec"
        slots={HEC_PHOTO_SLOTS}
        variant="hec"
        fileName={hecSurveyFileName}
        build={async (form, images) => {
          const res = await fetch('/hec/template.docx');
          if (!res.ok) throw new Error(`서식을 불러오지 못했습니다 (${res.status})`);
          return (await fillHecSurvey(form, images, await res.arrayBuffer())) as Blob;
        }}
      />
    </ContractPageShell>
  );
}
