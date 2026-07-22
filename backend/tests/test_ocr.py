"""Tests for vision OCR (app.services.ocr_service).

Pure helpers and the Pillow preprocessing run for real; the Groq vision call is
monkeypatched so nothing hits the network (mirrors test_negotiation.py).
"""

import base64
import io

import pytest

from app.services import ocr_service
from app.services.ocr_service import (
    OcrError,
    _preprocess_to_data_url,
    image_to_text,
    is_image_upload,
)


def _make_png(width: int = 40, height: int = 40) -> bytes:
    from PIL import Image

    img = Image.new("RGB", (width, height), (200, 210, 220))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestIsImageUpload:
    @pytest.mark.parametrize(
        "content_type,file_name",
        [
            ("image/jpeg", ""),
            ("image/png", "scan.png"),
            (None, "contract.JPG"),
            ("image/heic", ""),
            (None, "photo.heic"),
        ],
    )
    def test_detects_images(self, content_type, file_name):
        assert is_image_upload(content_type, file_name) is True

    @pytest.mark.parametrize(
        "content_type,file_name",
        [
            ("application/pdf", "contract.pdf"),
            ("text/plain", "notes.txt"),
            (None, "agreement.docx"),
        ],
    )
    def test_rejects_non_images(self, content_type, file_name):
        assert is_image_upload(content_type, file_name) is False


class TestPreprocess:
    def test_produces_bounded_jpeg_data_url(self):
        # A 5000px image must be downscaled to <= 2000px and emitted as JPEG.
        data_url = _preprocess_to_data_url(_make_png(5000, 3000))
        assert data_url.startswith("data:image/jpeg;base64,")

        from PIL import Image

        raw = base64.b64decode(data_url.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw))
        assert img.format == "JPEG"
        assert max(img.size) <= 2000

    def test_unreadable_bytes_raise(self):
        with pytest.raises(OcrError) as exc:
            _preprocess_to_data_url(b"not an image")
        assert exc.value.code == "UNREADABLE_IMAGE"


class TestImageToText:
    async def test_heic_rejected_before_any_call(self, monkeypatch):
        called = False

        async def _fake_ocr(*args, **kwargs):
            nonlocal called
            called = True
            return "x"

        monkeypatch.setattr(ocr_service, "ocr_complete", _fake_ocr)
        with pytest.raises(OcrError) as exc:
            await image_to_text(b"whatever", "image/heic", "photo.heic")
        assert exc.value.code == "HEIC_UNSUPPORTED"
        assert called is False

    async def test_transcribes_via_vision_model(self, monkeypatch):
        captured = {}

        async def _fake_ocr(data_url, prompt, temperature=0.0):
            captured["data_url"] = data_url
            captured["prompt"] = prompt
            return "  RESIDENTIAL LEASE AGREEMENT ...  "

        monkeypatch.setattr(ocr_service, "ocr_complete", _fake_ocr)
        text = await image_to_text(_make_png(), "image/png", "scan.png")
        assert text == "RESIDENTIAL LEASE AGREEMENT ..."  # stripped
        assert captured["data_url"].startswith("data:image/jpeg;base64,")
        assert "Transcribe" in captured["prompt"]
