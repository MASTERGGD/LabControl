"""Bound compressed and uncompressed inputs before handing them to parsers."""
import io
import zipfile
from fastapi import HTTPException

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_EXPANDED_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 2048


def validate_archive(content):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_ENTRIES or sum(i.file_size for i in entries) > MAX_EXPANDED_BYTES:
                raise HTTPException(413, "El archivo descomprimido supera los límites permitidos")
            for info in entries:
                if info.flag_bits & 1 or info.file_size > max(info.compress_size, 1) * 200:
                    raise HTTPException(413, "Archivo comprimido no permitido")
    except zipfile.BadZipFile as exc:
        raise HTTPException(400, "Archivo ZIP/Excel inválido") from exc


async def read_upload(upload, max_bytes=MAX_UPLOAD_BYTES, archive=True):
    chunks = []
    total = 0
    while True:
        chunk = await upload.read(min(1024 * 1024, max_bytes + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(413, "El archivo supera el tamaño permitido")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(400, "El archivo está vacío")
    if archive:
        validate_archive(content)
    return content
