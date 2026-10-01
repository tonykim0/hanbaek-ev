'use client';

/**
 * 플러그링크 실사보고서 v22 작성 — 실사개요·전경사진·도면·거점별 사진대지·공사내역서(입력).
 * 서식은 플러그링크가 준 빈 서식 그대로다(public/survey/pluglink-v22.xlsx · lib/survey/fill-pluglink).
 */
import PluglinkEditor from '@/components/survey/PluglinkEditor';
import { ContractPageShell } from '@/components/contracts/PageChrome';

export default function PluglinkSurveyPage() {
  return (
    <ContractPageShell title="플러그링크 실사보고서" back={{ href: '/survey', label: '← 운영사 다시 선택' }}>
      <PluglinkEditor />
    </ContractPageShell>
  );
}
