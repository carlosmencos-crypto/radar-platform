from pathlib import Path
import hashlib,json,re,sys
p=Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
original=(p/'ocr-original.js').read_text()
assert sha(original.encode())=='31ccc22f21e7a174c16f05405362e91a5f0bc61bdf36c136ccf13e213a0544ff'
entry=(p/'fixed-entry.js').read_text()
# The lazy OCR chunk imported CommonJS helpers from an obsolete executable app entry.
# Extract the same pure bundler helpers into a side-effect-free module.
helpers=entry[:entry.index('(function(){let e=document.createElement')]
assert 'document' not in helpers and 'createRoot' not in helpers
helpers+='export{d as a,f as i,o as n,c as r,s as t};\n'
helper_name='ocr-helpers-'+sha(helpers.encode())[:16]+'.js'
assert original.count('./index-DACKz-qw.js')==1
chunk=original.replace('./index-DACKz-qw.js','./'+helper_name)
chunk_name='src-ocr-isolated-'+sha(chunk.encode())[:16]+'.js'
assert entry.count('./src-CA_4_WxC.js')==2
entry=entry.replace('./src-CA_4_WxC.js','./'+chunk_name)
(p/'fixed-entry.js').write_text(entry)
(p/helper_name).write_text(helpers);(p/chunk_name).write_text(chunk)
(p/'ocr-modules.json').write_text(json.dumps({'helper':helper_name,'chunk':chunk_name}))
print('OCR_DEPENDENCY_ISOLATED',helper_name,chunk_name)
