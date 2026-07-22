"""
PDF text processing with semantic chunking.
Port of pdfProcessingService.ts + pdfToMarkdownService.ts
"""

import re

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:  # Backward compatibility with older langchain builds
    from langchain.text_splitter import RecursiveCharacterTextSplitter


def _is_likely_heading(text: str) -> bool:
    lines = text.split("\n")
    if len(lines) > 3:
        return False
    first_line = lines[0].strip()
    if not first_line:
        return False
    return bool(
        re.match(r"^\d+(\.\d+)*\.?\s", first_line)
        or re.match(r"^[IVX]+\.?\s", first_line)
        or re.match(r"^[A-Z]\.?\s", first_line)
        or (first_line == first_line.upper() and 3 < len(first_line) < 100)
        or re.match(
            r"^(section|chapter|part|article|clause|schedule|appendix|exhibit)\s+\d+",
            first_line,
            re.I,
        )
        or (len(first_line) < 80 and first_line.endswith(":"))
        or (len(first_line) < 60 and len(lines) == 1)
    )


def _get_heading_level(heading: str) -> int:
    first_line = heading.split("\n")[0].strip()
    m = re.match(r"^(\d+(?:\.\d+)*)\.?\s", first_line)
    if m:
        return len(m.group(1).split("."))
    if re.match(r"^[IVX]+\.?\s", first_line):
        return 1
    if re.match(r"^[A-Z]\.?\s", first_line):
        return 2
    return 1


# ─────────── Public API ───────────


def chunk_text(text: str, chunk_size: int = 4000, overlap: int = 300) -> list[str]:
    """Semantic-aware text chunking using LangChain with optimized separators."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
    )
    return splitter.split_text(text)


def chunk_text_with_offsets(text: str, chunk_size: int = 4000, overlap: int = 300) -> list[dict]:
    """Chunk text and record each chunk's character span in the original text.

    Returns dicts with ``text``, ``start`` and ``end`` (character offsets into
    ``text``). The offsets let callers map a retrieved chunk back to the exact
    place in the source document — used for impact-simulator citations that jump
    to the cited passage. ``start``/``end`` are -1 for the rare chunk that can't
    be located verbatim (e.g. whitespace the splitter normalised away); callers
    should treat those as non-locatable rather than mis-highlight.
    """
    chunks = chunk_text(text, chunk_size, overlap)
    spans: list[dict] = []
    cursor = 0
    for chunk in chunks:
        # Search forward from the last hit so repeated fragments resolve to the
        # right occurrence; fall back to a full scan if overlap pushed us past.
        idx = text.find(chunk, cursor)
        if idx == -1:
            idx = text.find(chunk)
        if idx == -1:
            spans.append({"text": chunk, "start": -1, "end": -1})
            continue
        spans.append({"text": chunk, "start": idx, "end": idx + len(chunk)})
        # Advance just past this chunk's start so the next (overlapping) chunk
        # is still findable further along the document.
        cursor = idx + 1
    return spans


def convert_pdf_to_markdown(pdf_text: str) -> str:
    """
    Simple converter that normalises PDF text – same role as pdfToMarkdownService.ts.
    """
    md = re.sub(r"\r\n", "\n", pdf_text)
    md = re.sub(r"\r", "\n", md)
    md = re.sub(r"\n{3,}", "\n\n", md)
    lines = md.split("\n")
    result: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append("")
            continue
        if _is_likely_heading(stripped):
            level = _get_heading_level(stripped)
            result.append(f"{'#' * level} {stripped}")
        else:
            result.append(stripped)
    return "\n".join(result).strip()
