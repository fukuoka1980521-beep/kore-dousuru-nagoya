from pathlib import Path
import hashlib, sys, urllib.request

local_a=Path("src/app/assist/career-r8.js").read_bytes()
local_b=Path("handa/career-r8.js").read_bytes()
if local_a != local_b:
    print("LOCAL_DRIFT nagoya_vs_handa")
    sys.exit(1)

url="https://raw.githubusercontent.com/fukuoka1980521-beep/kore-dousuru-obu/master/src/app/assist/career-r8.js"
req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 career-pack-drift-check/1.0"})
try:
    with urllib.request.urlopen(req,timeout=30) as r:
        obu=r.read()
except Exception as e:
    print("REMOTE_FETCH_FAILED",repr(e))
    sys.exit(2)

if local_a != obu:
    print("REMOTE_DRIFT nagoya_vs_obu")
    print("nagoya",hashlib.sha256(local_a).hexdigest())
    print("obu",hashlib.sha256(obu).hexdigest())
    sys.exit(1)

print("CAREER_PACK_DRIFT_PASS",hashlib.sha256(local_a).hexdigest())
