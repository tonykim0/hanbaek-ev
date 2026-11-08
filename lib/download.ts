/** @param revokeAfterMs 주소를 거두기까지 — 큰 파일(제안서 20MB 안팎)은 받기가 늦게 시작해 길게 둔다 */
export function downloadBlob(blob: Blob, filename: string, revokeAfterMs = 1000): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}
