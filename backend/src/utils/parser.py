import fitz  # PyMuPDF
from docx import Document
import os
from typing import Protocol

class DocumentParser(Protocol):
    """Interface for all document parsers."""
    def extract_text(self, file_path: str) -> str:
        ...

class PDFParser:
    def extract_text(self, file_path: str) -> str:
        text = ""
        with fitz.open(file_path) as doc:
            for page in doc:
                text += page.get_text()
        return text

class DocxParser:
    def extract_text(self, file_path: str) -> str:
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])

class TXTParser:
    def extract_text(self, file_path: str) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

class ParserFactory:
    """The Factory: Decides which parser to use based on file extension."""
    _parsers = {
        ".pdf": PDFParser(),
        ".docx": DocxParser(),
        ".txt": TXTParser()
    }

    @staticmethod
    def get_parser(file_path: str) -> DocumentParser:
        ext = os.path.splitext(file_path)[1].lower()
        parser = ParserFactory._parsers.get(ext)
        if not parser:
            raise ValueError(f"Unsupported file extension: {ext}")
        return parser