import hashlib, json, pathlib, sys, urllib.request

SOURCES = [
    "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/part_haken/jigyounushi/career.html",
    "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000118801_00022.html",
    "https://www.mhlw.go.jp/content/11910500/001729696.pdf",
    "https://www.mhlw.go.jp/content/11910500/001688027.pdf",
]
BASE = pathlib.Path("monitor/career-source-baseline.json")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0 admin-support-source-watch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

current = {}
for url in SOURCES:
    try:
        data = fetch(url)
    except Exception as e:
        print("SOURCE_FETCH_FAILED", url, repr(e))
        sys.exit(3)
    current[url] = hashlib.sha256(data).hexdigest()
    print("CURRENT", url, current[url])

if not BASE.exists():
    print("BASELINE_REQUIRED")
    for u,h in current.items():
        print("BASELINE", u, h)
    sys.exit(2)

expected = json.loads(BASE.read_text(encoding="utf-8"))
changed = []
for u,h in current.items():
    if expected.get(u) != h:
        changed.append((u, expected.get(u), h))
if changed:
    print("SOURCE_CHANGED")
    for u,old,new in changed:
        print("CHANGED", u, old, new)
    sys.exit(1)
print("SOURCE_WATCH_PASS", len(current))
