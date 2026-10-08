from pathlib import Path
import hashlib,sys
s=Path(sys.argv[1]).read_text()
# The inner TSE result scope declares g for control confidences. Referring to g in
# the optimized loops hits its temporal dead zone, instead of the outer row sets.
needle='E=e=>Ue(e),ne=`Preparando lector`'
assert s.count(needle)==1
s=s.replace(needle,'radarThresholdRows=g,E=e=>Ue(e),ne=`Preparando lector`')
needle='for(let[e,radarSet]of g.entries())'
assert s.count(needle)==2
s=s.replace(needle,'for(let[e,radarSet]of radarThresholdRows.entries())')
Path(sys.argv[2]).write_text(s)
print('TSE_SCOPE_FIX_OK',hashlib.sha256(s.encode()).hexdigest())
