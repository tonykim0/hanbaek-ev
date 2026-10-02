/**
 * 실사보고서 임시 저장본의 모양 — 화면(브라우저)과 서버가 같이 본다. [순수 모듈]
 *
 * 화면의 값에는 사진이 File 로 들어 있다. 저장할 때 사진은 Blob 에 먼저 올리고 그 자리를 이 꼴로
 * 바꿔 data(jsonb)에 둔다. 서버는 data 를 열지 않고 이 꼴만 찾아 「이 계정·이 저장본의 자리인가」를 본다.
 */
export const DRAFT_ROOT = 'survey-drafts';
export const SURVEY_CPOS = ['hec', 'sk', 'nice', 'pluglink'] as const;
export type DraftCpo = (typeof SURVEY_CPOS)[number];
/** 계정 하나가 쌓아 두는 저장본 상한 — 사진이 Blob 에 남으므로 끝없이 늘지 않게 */
export const MAX_DRAFTS = 50;
/** 저장본 하나의 값(사진 빼고) 상한 — 표시·체크리스트를 다 넣어도 수십 KB 다 */
export const MAX_DRAFT_JSON = 2 * 1024 * 1024;

/**
 * 저장이 거절되는 두 까닭 — 화면이 이 글로 알아보고 「새 저장본으로 저장」·「불러오기」 길을 연다(DraftControls).
 * 저장소(store/survey-drafts)와 라우트가 이 글을 그대로 던진다.
 */
export const DRAFT_CONFLICT = '다른 창이나 기기에서 이 저장본을 먼저 저장했습니다 — 다시 불러오거나 새 저장본으로 저장해 주세요.';
export const DRAFT_NOT_FOUND = '임시 저장본을 찾을 수 없습니다 — 지워졌거나 다른 계정의 것입니다.';

/** 저장본의 사진 자리 — 그 계정·그 저장본의 폴더 안이어야 한다 */
export const draftPrefix = (ownerId: string, draftId: string) => `${DRAFT_ROOT}/${ownerId}/${draftId}/`;

export interface PhotoRef { __photo: true; url: string; path: string; name: string; type: string }

export const isPhotoRef = (v: unknown): v is PhotoRef =>
  !!v && typeof v === 'object' && (v as { __photo?: unknown }).__photo === true
  && typeof (v as PhotoRef).path === 'string' && typeof (v as PhotoRef).url === 'string';

/** 값 속 사진 자리를 하나하나 바꾼 새 값 — 배열·보통 객체만 따라 내려간다 */
export function mapPhotoRefs(v: unknown, f: (r: PhotoRef) => PhotoRef): unknown {
  if (isPhotoRef(v)) return f(v);
  if (Array.isArray(v)) return v.map((x) => mapPhotoRefs(x, f));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapPhotoRefs(x, f)]));
  }
  return v;
}

export function photoRefsOf(v: unknown): PhotoRef[] {
  const out: PhotoRef[] = [];
  mapPhotoRefs(v, (r) => { out.push(r); return r; });
  return out;
}

export interface DraftSummary { id: string; cpo: DraftCpo; title: string; photoCount: number; updatedAt: string }
export interface DraftFull extends DraftSummary { data: unknown }
