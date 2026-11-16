"""surum1.md dosyasından Word (.docx) raporu üretir.

Kullanım:  python md_to_docx.py surum1.md surum1.docx
Gerekli paket:  pip install python-docx
"""
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ACCENT = RGBColor(0x1F, 0x3A, 0x68)
INLINE = re.compile(r"(\*\*.+?\*\*|`.+?`)")


def add_inline(par, text):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            par.add_run(part[2:-2]).bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = par.add_run(part[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9.5)
        else:
            par.add_run(part)


def shade(cell, hex_color):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tc_pr.append(shd)


def add_table(doc, rows, cover=False):
    rows = [r for r in rows if not re.fullmatch(r"\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?", r)]
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    header_empty = all(not c for c in cells[0])
    if header_empty:
        cells = cells[1:]
    table = doc.add_table(rows=len(cells), cols=len(cells[0]))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(cells):
        for j, text in enumerate(row):
            cell = table.cell(i, j)
            cell.text = ""
            par = cell.paragraphs[0]
            add_inline(par, text)
            for run in par.runs:
                run.font.size = Pt(10)
            is_header = (i == 0 and not header_empty) or (cover and j == 0)
            if is_header:
                for run in par.runs:
                    run.bold = True
                shade(cell, "DCE4F0")
    doc.add_paragraph()


def build(md_path, out_path):
    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = sec.bottom_margin = Cm(2.5)
    sec.left_margin = sec.right_margin = Cm(2.5)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    for name, size in (("Heading 1", 16), ("Heading 2", 13)):
        st = doc.styles[name]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.color.rgb = ACCENT

    lines = open(md_path, encoding="utf-8").read().splitlines()
    i = 0
    first_h1 = True
    first_table = True
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            block = []
            while i < len(lines) and lines[i].startswith("|"):
                block.append(lines[i])
                i += 1
            add_table(doc, block, cover=first_table)
            if first_table:
                doc.paragraphs[-1].add_run().add_break(WD_BREAK.PAGE)
                first_table = False
            continue
        if line.startswith("# "):
            text = line[2:].strip()
            if first_h1:
                for _ in range(6):
                    doc.add_paragraph()
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = p.add_run(text)
                r.bold = True
                r.font.size = Pt(22)
                r.font.color.rgb = ACCENT
                first_h1 = False
            else:
                doc.add_heading(text, level=1)
        elif line.startswith("## "):
            text = line[3:].strip()
            if text.startswith("Proje Raporu"):
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = p.add_run(text)
                r.font.size = Pt(14)
                for _ in range(3):
                    doc.add_paragraph()
            else:
                doc.add_heading(text, level=2)
        elif re.match(r"^- ", line):
            add_inline(doc.add_paragraph(style="List Bullet"), line[2:])
        elif re.match(r"^\d+\. ", line):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(1.0)
            p.paragraph_format.first_line_indent = Cm(-0.6)
            add_inline(p, line)
        elif line.strip():
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            add_inline(p, line)
        i += 1
    doc.save(out_path)


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "surum1.md"
    dst = sys.argv[2] if len(sys.argv) > 2 else "surum1.docx"
    build(src, dst)
    print("Oluşturuldu:", dst)
