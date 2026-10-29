/**
 * 서류 문구 수정 — 화면·라우트·저장소가 같이 보는 모양. [순수]
 */

/** 판독에 보내는 쪽 하나 — 긴 변 1600px 안팎의 JPEG. 상자 좌표는 이 그림의 화소다 */
export interface LocatePage { image: string; width: number; height: number }

export type Align = 'left' | 'center' | 'right';

/** 판독이 찾은 고칠 자리 하나 — 상자는 보낸 그림의 화소 좌표 */
export interface LocatedEdit {
  page: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  original: string;
  replacement: string;
  serif: boolean;
  bold: boolean;
  align: Align;
}

export interface LocateResult {
  docKind: string;
  edits: LocatedEdit[];
  /** 못 찾았거나 고치지 않은 까닭 — 없으면 null */
  note: string | null;
}

/** 받은 PDF 를 감사 기록에 남길 때 — 누가 어느 파일의 무엇을 무엇으로 */
export interface RetouchLog {
  file: string;
  prompt: string;
  edits: Array<{ page: number; from: string; to: string }>;
}
