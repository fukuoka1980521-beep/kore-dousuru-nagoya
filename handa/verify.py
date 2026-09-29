from pathlib import Path
import re, sys

root=Path(__file__).resolve().parent
idx=(root/"index.html").read_text(encoding="utf-8")
js=(root/"career-r8.js").read_text(encoding="utf-8")
vm=re.search(r"CAREER_UP_R8_20260408_V1_([0-9]+)_20260929",js)
checks={
 "career_version":bool(vm and int(vm.group(1))>=9),
 "official_qa":"001729696.pdf" in js,
 "checklist":"001688027.pdf" in js,
 "monthly_audit":"monthlyWageAudit" in js,
 "pack_gate":"applicablePackRows" in js,
 "oct_rule":"specialR810Rows" in js,
 "source_meta":"verifiedAt:\"2026-09-29\"" in js,
 "20_files":"files.length>20" in idx,
 "120mb":"120*1024*1024" in idx,
 "20_pages":"Math.min(pdf.numPages,20)" in idx,
 "print":"docPrintBtn" in idx,
 "clear":"docClearBtn" in idx,
 "next_action":"次にすること" in idx,
 "wage_copy":"3％賃金増額" in idx,
 "partial_pdf":"PDF_PARTIAL" in idx and "PDFの未読ページあり" in js,
 "provenance":"FORM RULE PACK" in idx and "解析対象ファイル" in idx,
 "dependency_pin":"tesseract.js@5.1.1" in idx and "pdf.js/3.11.174" in idx,
 "career_search":"career_up_regularization" in idx and "契約社員を正社員にしたい" in idx and "厚生労働省公式情報" in idx,
}
bad=[k for k,v in checks.items() if not v]
for k,v in checks.items(): print(("PASS" if v else "FAIL"),k)
if bad:
    print("FAILED",",".join(bad));sys.exit(1)
print("PASS",len(checks),"/",len(checks))
