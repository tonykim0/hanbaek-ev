/**
 * 담당에게 넘긴 파일 — 자리 · 이름 · 크기 · 에이전트가 읽는 법 (한백 지시 2026-11-02 「담당자들한테 파일을 넘겨주는 경우도
 * 있으니 파일업로드 기능도 넣어줘」). 화면 · 라우트 · 저장소 · 에이전트가 같이 본다 — 아무것도 끌어오지 않는다.
 *
 * 파일은 브라우저가 Blob 에 바로 올린다(서버는 자리를 지어 주고 토큰만 준다 — survey-drafts 사진과 같은 길). 자리는 서버가
 * 짓는다: agent-files/<담당>/<무작위>/<파일 이름>. 저장할 때 라우트가 그 자리가 이 담당의 것이고 우리 Blob 에 실제로
 * 있는지 다시 본다(lib/intake-stage ourBlob) — 클라이언트가 준 주소를 믿지 않는다.
 */

/** 한 파일 상한 — 계약서 묶음 스캔(20MB 넘는 것이 있다)도 받는다 */
export const AGENT_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** 한 말에 붙이는 파일 수 */
export const AGENT_FILES_PER_MESSAGE = 10;

export const agentFilePrefix = (agentId: string) => `agent-files/${agentId}/`;

/** 파일 이름 정리 — 경로 구분자 · 제어문자 · 앞의 점을 지우고 120자로(확장자는 남긴다). 맥의 NFD 자모를 완성형으로 */
export function agentFileName(name: string): string {
  const clean = name
    .normalize('NFC')
    .replace(/[/\\]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim() || '파일';
  if (clean.length <= 120) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : '';
  return clean.slice(0, 120 - ext.length) + ext;
}

/**
 * 에이전트가 읽는 법 —
 *   pdf · image  Claude 가 주소로 바로 읽는다(그림도 본다)
 *   text · sheet · word · hwpx  서버가 글자만 뽑아 넘긴다(lib/agents/file-text)
 *   none         이름만 안다 — 한글(.hwp) · 옛 엑셀(.xls) · 압축 같은 것
 */
export type AgentFileRead = 'pdf' | 'image' | 'text' | 'sheet' | 'word' | 'hwpx' | 'none';

const EXT_READ: Record<string, AgentFileRead> = {
  pdf: 'pdf',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  txt: 'text', csv: 'text', tsv: 'text', md: 'text', json: 'text', xml: 'text',
  xlsx: 'sheet',
  docx: 'word',
  hwpx: 'hwpx',
};

export function agentFileRead(name: string): AgentFileRead {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return EXT_READ[ext] ?? 'none';
}

/** 1.2MB · 340KB · 12B */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}
