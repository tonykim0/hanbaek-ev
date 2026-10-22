#!/usr/bin/env python3
"""서식 pptx 의 그림을 줄인다 — ★원본은 안 건드린다★ (새 파일로 쓴다).

    python3 scripts/shrink-pptx.py <원본.pptx> <결과.pptx>

★왜 줄이나★ 제안서 서식은 브라우저까지 내려와야 채울 수 있다(서버에서 채우면 Vercel 함수가
압축을 통째로 메모리에 푼다 — 실사보고서도 같은 이유로 브라우저에서 채운다). 솔라쉐어바로
서식은 65.8MB 인데 그중 58MB 가 회사소개 슬라이드의 큰 PNG 라, 제안서 한 장 만들 때마다
그 무게를 두 번 옮긴다. 17MB 로 줄이면 같은 일이 네 배 가볍다.

★투명도를 실제로 쓰는 그림은 안 건드린다★ — PNG 중에 로고·도형처럼 뒤가 비치는 것이 있다.
모드만 보고 가르면(RGBA 면 투명) 사진까지 남아 안 줄어들고, 반대로 다 바꾸면 로고 뒤가
흰 네모로 막힌다. ★알파 채널의 최솟값★을 봐서 실제로 쓰는 것만 PNG 로 둔다(이 서식은
63개 중 28개가 진짜 투명이었다).

★확장자를 바꾸면 가리키는 자리도 바꾼다★ — pptx 는 media 파일을 .rels 의 Target 으로
가리키고, [Content_Types].xml 이 확장자로 형식을 정한다. 파일만 바꾸면 파워포인트가
「복구할 수 없는 내용」이라며 안 연다.

Pillow 가 있어야 한다: pip3 install Pillow
"""
import io
import re
import sys
import zipfile

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow 가 없습니다 — pip3 install Pillow")

MEDIA = re.compile(r"^ppt/media/[^/]+\.png$", re.I)
LONG_EDGE = 1920  # 슬라이드가 1600x900 안팎이라 이보다 크면 쓰이지 않는 화소다
QUALITY = 88


def alpha_used(im: Image.Image) -> bool:
    """투명도를 실제로 쓰는가 — 알파가 한 점이라도 255 미만이면 쓴다."""
    if im.mode not in ("RGBA", "LA") and not (im.mode == "P" and "transparency" in im.info):
        return False
    lo, _ = im.convert("RGBA").getchannel("A").getextrema()
    return lo < 255


def shrink(src: str, dst: str) -> None:
    zin = zipfile.ZipFile(src)
    renamed: dict[str, str] = {}   # 옛 파일 이름 → 새 파일 이름
    out: dict[str, bytes] = {}
    kept = conv = 0

    for info in zin.infolist():
        raw = zin.read(info.filename)
        if not MEDIA.match(info.filename):
            out[info.filename] = raw
            continue
        try:
            im = Image.open(io.BytesIO(raw))
            im.load()
        except Exception:
            out[info.filename] = raw
            kept += 1
            continue

        if max(im.size) > LONG_EDGE:
            r = LONG_EDGE / max(im.size)
            im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)

        if alpha_used(im):
            buf = io.BytesIO()
            im.save(buf, "PNG", optimize=True)
            out[info.filename] = buf.getvalue() if buf.tell() < len(raw) else raw
            kept += 1
            continue

        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=QUALITY, optimize=True)
        if buf.tell() >= len(raw):
            out[info.filename] = raw   # 줄지 않으면 그대로 — 바꿀 이유가 없다
            kept += 1
            continue
        new = re.sub(r"\.png$", ".jpeg", info.filename, flags=re.I)
        out[new] = buf.getvalue()
        renamed[info.filename.split("/")[-1]] = new.split("/")[-1]
        conv += 1

    # ★가리키는 자리를 같이 고친다★ — .rels 의 Target 과 [Content_Types].xml
    for name in list(out):
        if not name.endswith(".rels") and name != "[Content_Types].xml":
            continue
        text = out[name].decode("utf-8")
        before = text
        for old, new in renamed.items():
            text = text.replace(old, new)
        if name == "[Content_Types].xml" and "Extension=\"jpeg\"" not in text:
            text = text.replace(
                "<Types ",
                "<Types ", 1
            ).replace(
                "</Types>",
                '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>',
            )
        if text != before:
            out[name] = text.encode("utf-8")

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in out.items():
            zout.writestr(name, data)

    a = len(open(src, "rb").read()) / 1048576
    b = len(open(dst, "rb").read()) / 1048576
    print(f"그림 {conv}개 JPEG 로 · {kept}개 그대로(투명도를 쓰거나 안 줄어드는 것)")
    print(f"{a:.1f}MB → {b:.1f}MB")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("원본과 결과 경로를 주세요.")
    shrink(sys.argv[1], sys.argv[2])
