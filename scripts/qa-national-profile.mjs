import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
export function attachRecoveredElectoralData(profile) {
  const code = profile.municipality_code;
  const publicDepth = JSON.parse(fs.readFileSync(path.join(root, "supabase/fixtures/municipal-public-depth.json"), "utf8"));
  profile.public_context = publicDepth.find((row) => row.municipality_code === code);
  const egm = JSON.parse(fs.readFileSync(path.join(root, "supabase/fixtures/municipal-egm.json"), "utf8"));
  profile.egm_2024 = egm.find((row) => row.municipality_code === code);
  const bases = JSON.parse(fs.readFileSync(path.join(root, "supabase/fixtures/tse-agreement-327-bases.json"), "utf8"));
  profile.electoral_basis_2027 = bases.find((basis) => basis.municipality_code === code);
  for (const file of fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => /load_tse_2023_municipal_corporations_part_/.test(name))) {
    const sql = fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8");
    const row = sql.split("\n").find((line) => line.startsWith(`    ('${code}',`));
    if (!row) continue;
    const fields = [...row.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replaceAll("''", "'"));
    const council = JSON.parse(fields[3]);
    profile.electoral_history.councils = [...profile.electoral_history.councils.filter((item) => item.year !== 2023), council];
    const election = profile.electoral_history.elections.find((item) => item.year === 2023);
    if (election) election.winner_candidate = fields[1];
  }
  if (!profile.electoral_basis_2027 || !profile.electoral_history.councils.some((c) => c.year === 2023)) throw new Error(`Missing recovered QA evidence for ${code}`);
  return profile;
}

export function loadRecoveredManagementBenchmark(code) {
  for (const file of fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => /enrich_rgm_management_benchmark_part_/.test(name))) {
    const row = fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8").split("\n").find((line) => line.startsWith(`    ('${code}',`));
    if (!row) continue;
    const fields = [...row.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replaceAll("''", "'"));
    return JSON.parse(fields[1]);
  }
  throw new Error(`Missing recovered RGM evidence for ${code}`);
}
