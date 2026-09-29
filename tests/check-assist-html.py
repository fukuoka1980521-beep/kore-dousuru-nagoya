from pathlib import Path
import re, subprocess, sys, tempfile

FILES = [Path(p) for p in sys.argv[1:]]
if not FILES:
    raise SystemExit("no html files")

for p in FILES:
    s=p.read_text(encoding="utf-8")
    blocks=[]
    for attrs,body in re.findall(r"<script([^>]*)>(.*?)</script>",s,re.S|re.I):
        a=attrs.lower()
        if "src=" in a or "application/json" in a:
            continue
        blocks.append(body)
    js="\n;\n".join(blocks)
    with tempfile.NamedTemporaryFile("w",suffix=".js",delete=False,encoding="utf-8") as f:
        f.write(js)
        tmp=f.name
    cp=subprocess.run(["node","--check",tmp],capture_output=True,text=True)
    if cp.returncode:
        print("INLINE_JS_FAIL",p)
        print(cp.stdout);print(cp.stderr)
        raise SystemExit(1)
    required=["最大20ファイル","PDF保存","tesseract.js@5.1.1","pdf.js/3.11.174","career_up_regularization","契約社員を正社員にしたい"]
    for x in required:
        if x not in s:
            print("MARKER_FAIL",p,x);raise SystemExit(1)
    if "src/app/assist" in str(p) and "function detect(t,names)" not in s:
        print("FILENAME_DETECT_FAIL",p);raise SystemExit(1)
    if "career-r8.js" not in s:
        print("PACK_LOAD_FAIL",p);raise SystemExit(1)
    print("HTML_JS_PASS",p)
