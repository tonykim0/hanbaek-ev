'use client';

/**
 * 사진 한 장을 서식에 넣을 꼴로 굽는다 — 방향을 바로 하고, 긴 변 1600px JPEG 로. [브라우저 전용]
 *
 * ★왜 줄이나★ 휴대폰 원본은 한 장에 5~10MB 다. 거점 셋에 일곱 장씩이면 워드 하나가 150MB 를
 * 넘어 메일로도 접수 ZIP 으로도 못 보낸다(접수 상한 lib/claude-chunked). 서식 칸은 가로 9cm
 * 남짓이라 1600px 이면 인쇄해도 흐리지 않다.
 *
 * ★방향★ 휴대폰은 픽셀을 옆으로 눕힌 채 저장하고 EXIF 에 「돌려 보라」고만 적는다. 그대로
 * 워드에 넣으면 사진이 누워 들어간다. createImageBitmap 의 imageOrientation 이 그것을 읽어 세운다.
 */
import type { PreparedImage } from './docx-kit';

const LONG_EDGE = 1600;
const QUALITY = 0.85;

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) {
    throw new Error(`${file.name} — 사진을 읽지 못했습니다. JPG·PNG 로 다시 올려주세요(아이폰 HEIC 는 설정에서 「호환성 우선」).`);
  }
  const scale = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  // JPEG 는 투명을 모른다 — PNG 의 빈 자리가 검게 나오지 않게 흰 바탕을 깐다
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(`${file.name} — 사진을 굽지 못했습니다.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}
