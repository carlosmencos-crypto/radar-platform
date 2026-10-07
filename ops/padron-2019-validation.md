# Historical registered voters review

2015: 338 municipalities with published counts, sum 7,556,873. Two later-created municipalities intentionally remain empty.
2019: 324 municipality counts verified from the TSE election memory, 13 numeric columns per sex row, actual municipality names and department names matched to RADAR codes. Six spelling aliases documented in the extractor.

The 16 municipalities of Sacatepéquez are excluded: the published male table duplicates the female table (100,771 each), overstating the domestic male reconciliation by 10,863. Never substitute November statistics or estimates for election-day registration. Female totals reconcile exactly to 4,386,642 national minus 24,260 abroad. Male national 3,763,579 minus 39,435 abroad must be 3,724,144; extracted duplicate table produces 3,735,007.

Source: 2019_Memoria_Elecciones.pdf, Drive file 12I3_dB7E5pweFdfm15hf8XTJ1k22dpDp. PDF SHA256: 6d250220e847d593fd9c3c1d0edcff7213fa27f2d8ddb49f73639ab356b9082e

Reproduce: pdftotext -f 236 -l 385 -layout SOURCE.pdf extract.txt; python ops/extract-padron-2019.py municipal-names.json extract.txt.
Reviewed existing CLEAN/VALIDACION historical sheets: result/authority vote totals, not an independent municipal padrón source. Official TSE November 2019 statistics are a different cut and were not substituted.
