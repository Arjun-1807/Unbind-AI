"""Vision OCR for photographed/scanned contract images.

Turns an uploaded image (phone photo, scan) into text using a Groq vision model,
so it can flow into the normal ``analyze_contract`` pipeline. The image is
downscaled and re-encoded with Pillow first — phone photos are multi-megabyte,
and a smaller JPEG keeps the base64 payload under Groq's per-image limit and
makes OCR faster. This is a plain HTTPS call to Groq (no native binary), so it
deploys on the existing serverless setup unchanged.
"""

import asyncio
import base64
import io
import logging

from langsmith import traceable

from app.services.groq_service import ocr_complete

logger = logging.getLogger(__name__)

# Content types / extensions we treat as OCR-able images.
IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/bmp",
}
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp")

# HEIC/HEIF (default iPhone format). Pillow can't decode it without pillow-heif,
# so we detect and reject it early with actionable guidance rather than failing
# opaquely.
HEIC_CONTENT_TYPES = {"image/heic", "image/heif"}
HEIC_EXTENSIONS = (".heic", ".heif")

_MAX_DIM = 2000  # px — longest side after downscaling
_JPEG_QUALITY = 85

_OCR_PROMPT = (
    "Transcribe all the text in this image of a document exactly as written, "
    "preserving line breaks and reading order. Output only the raw text — no "
    "summary, no explanation, no commentary, no markdown."
)


class OcrError(Exception):
    """Raised when an image can't be OCR'd. ``code`` drives the API response."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _norm(content_type: str | None, file_name: str) -> tuple[str, str]:
    return (content_type or "").lower(), (file_name or "").lower()


def is_image_upload(content_type: str | None, file_name: str = "") -> bool:
    """True if the upload looks like an OCR-able image (incl. HEIC, so the route
    can route it here and surface the HEIC-specific message)."""
    ct, name = _norm(content_type, file_name)
    if ct in IMAGE_CONTENT_TYPES or ct in HEIC_CONTENT_TYPES:
        return True
    return name.endswith(IMAGE_EXTENSIONS) or name.endswith(HEIC_EXTENSIONS)


def _is_heic(content_type: str | None, file_name: str) -> bool:
    ct, name = _norm(content_type, file_name)
    return ct in HEIC_CONTENT_TYPES or name.endswith(HEIC_EXTENSIONS)


def _preprocess_to_data_url(content: bytes) -> str:
    """Downscale + re-encode the image as JPEG and return a base64 data URL.

    Synchronous/CPU-bound — call via ``asyncio.to_thread``.
    """
    from PIL import Image, UnidentifiedImageError

    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise OcrError("UNREADABLE_IMAGE", "The image could not be read.") from exc

    # Flatten to RGB (drops alpha/palette) so JPEG encoding always succeeds.
    if img.mode != "RGB":
        img = img.convert("RGB")

    # thumbnail() only ever shrinks and preserves aspect ratio.
    img.thumbnail((_MAX_DIM, _MAX_DIM))

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=_JPEG_QUALITY)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


@traceable(name="image_to_text")
async def image_to_text(
    content: bytes,
    content_type: str | None,
    file_name: str = "",
) -> str:
    """OCR an uploaded image to text via the Groq vision model.

    Raises ``OcrError`` for HEIC or unreadable images. The caller applies the
    downstream "too little text" gate.
    """
    if _is_heic(content_type, file_name):
        raise OcrError(
            "HEIC_UNSUPPORTED",
            "iPhone HEIC photos aren't supported directly. Set your camera to "
            "'Most Compatible' (JPEG), or upload a screenshot of the photo.",
        )

    data_url = await asyncio.to_thread(_preprocess_to_data_url, content)
    text = await ocr_complete(data_url, _OCR_PROMPT)
    return (text or "").strip()
