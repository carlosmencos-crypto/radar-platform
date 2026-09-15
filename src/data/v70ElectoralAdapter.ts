import type { AuthorizedLayerRecord } from "./radarRuntime";

export const V70_ELECTION_ORDER = [
  "PRESIDENTE",
  "DIP_NAC",
  "DIP_DIST",
  "CORPORACION_MUNICIPAL",
  "DIP_PAR",
] as const;

export type V70ElectionCode = (typeof V70_ELECTION_ORDER)[number];
export type V70Availability = "PUBLICADO" | "PARCIAL" | "NO_PUBLICADO" | "SIN_REGISTRO";
export type V70GeoState = "ASOCIACION_EXACTA" | "SIN_ASOCIACION";

export interface V70PartyResult {
  party: string;
  votes: number;
  share: number;
  rank: number;
}

export interface V70ElectionSummary {
  code: V70ElectionCode;
  shortName: string;
  name: string;
  expected: number | null;
  counted: number | null;
  countedShare: number | null;
  turnout: number | null;
  votesCast: number | null;
  optionVotes: number | null;
  leader: string | null;
  leaderVotes: number | null;
  leaderShare: number | null;
  runner: string | null;
  runnerVotes: number | null;
  marginVotes: number | null;
  marginShare: number | null;
  top: V70PartyResult[];
  availability: V70Availability;
  resultStatus: string | null;
}

export interface V70CenterElectionResult {
  counted: number | null;
  expected: number;
  turnout: number | null;
  votesCast: number | null;
  optionVotes: number | null;
  nullVotes: number | null;
  blankVotes: number | null;
  leader: string | null;
  leaderVotes: number | null;
  leaderShare: number | null;
  runner: string | null;
  runnerVotes: number | null;
  marginVotes: number | null;
  marginShare: number | null;
  top: V70PartyResult[];
  availability: V70Availability;
  mapStatus: string;
}

export interface V70ElectoralCenter {
  id: string;
  stableId: string;
  name: string;
  community: string;
  type: string;
  voters: number | null;
  jrv: number;
  jrvRange: string;
  lat: number | null;
  lon: number | null;
  geoState: V70GeoState;
  elections: Record<V70ElectionCode, V70CenterElectionResult>;
}

export interface V70ElectoralViewModel {
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  snapshot: string | null;
  resultStatus: string | null;
  elections: V70ElectionSummary[];
  centers: V70ElectoralCenter[];
  qa: {
    status: "PASS" | "PARTIAL";
    missingLayers: string[];
    geoExact: number;
    geoHeld: number;
  };
}

type Dict = Record<string, unknown>;

const RESULT_LAYER_BY_ELECTION: Record<V70ElectionCode, string> = {
  PRESIDENTE: "TREP_2023_CENTER_RESULTS_PRESIDENTE",
  DIP_NAC: "TREP_2023_CENTER_RESULTS_DIP_NAC",
  DIP_DIST: "TREP_2023_CENTER_RESULTS_DIP_DIST",
  CORPORACION_MUNICIPAL: "TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL",
  DIP_PAR: "TREP_2023_CENTER_RESULTS_DIP_PAR",
};

const SHORT_NAME: Record<V70ElectionCode, string> = {
  PRESIDENTE: "Presidencia",
  DIP_NAC: "Lista nacional",
  DIP_DIST: "Distrito",
  CORPORACION_MUNICIPAL: "Alcaldía",
  DIP_PAR: "Parlacen",
};

const LONG_NAME: Record<V70ElectionCode, string> = {
  PRESIDENTE: "Presidente y Vicepresidente",
  DIP_NAC: "Diputados por Lista Nacional",
  DIP_DIST: "Diputados Distritales",
  CORPORACION_MUNICIPAL: "Corporación Municipal",
  DIP_PAR: "Diputados al Parlamento Centroamericano",
};

function isDict(value: unknown): value is Dict {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requiredNumber(value: unknown, label: string): number {
  const parsed = asNumber(value);
  if (parsed === null) throw new Error(`V70 electoral adapter: ${label} inválido.`);
  return parsed;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function availabilityForLayer(layer: AuthorizedLayerRecord | undefined): V70Availability {
  if (!layer) return "NO_PUBLICADO";
  if (!layer.payload) return "SIN_REGISTRO";
  const qa = isDict(layer.payload.qa) ? layer.payload.qa : null;
  const qaStatus = qa ? asString(qa.status || qa.all) : "";
  return qaStatus.includes("PASS") ? "PUBLICADO" : "PARCIAL";
}

function emptyElection(code: V70ElectionCode, availability: V70Availability): V70ElectionSummary {
  return {
    code,
    shortName: SHORT_NAME[code],
    name: LONG_NAME[code],
    expected: null,
    counted: null,
    countedShare: null,
    turnout: null,
    votesCast: null,
    optionVotes: null,
    leader: null,
    leaderVotes: null,
    leaderShare: null,
    runner: null,
    runnerVotes: null,
    marginVotes: null,
    marginShare: null,
    top: [],
    availability,
    resultStatus: null,
  };
}

function emptyCenterElection(expected: number, availability: V70Availability): V70CenterElectionResult {
  return {
    counted: null,
    expected,
    turnout: null,
    votesCast: null,
    optionVotes: null,
    nullVotes: null,
    blankVotes: null,
    leader: null,
    leaderVotes: null,
    leaderShare: null,
    runner: null,
    runnerVotes: null,
    marginVotes: null,
    marginShare: null,
    top: [],
    availability,
    mapStatus: availability === "PUBLICADO" ? "LISTO_PARA_MAPA" : availability,
  };
}

function tieAwareRanks(rows: Array<{ party: string; votes: number; share: number }>): V70PartyResult[] {
  const sorted = [...rows].sort((a, b) => b.votes - a.votes || a.party.localeCompare(b.party, "es-GT"));
  let previousVotes: number | null = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const rank = previousVotes === row.votes ? previousRank : index + 1;
    previousVotes = row.votes;
    previousRank = rank;
    return { ...row, rank };
  });
}

function parseOptions(payload: Dict): Array<{ source: string; key: string; municipalVotes: number; municipalShare: number; municipalRank: number }> {
  const schema = asArray(payload.option_schema).map((item) => asString(item));
  const sourceIndex = schema.indexOf("source");
  const keyIndex = schema.indexOf("key");
  const votesIndex = schema.indexOf("municipal_votes");
  const shareIndex = schema.indexOf("municipal_share");
  const rankIndex = schema.indexOf("municipal_rank");
  if ([sourceIndex, keyIndex, votesIndex, shareIndex, rankIndex].some((index) => index < 0)) {
    throw new Error("V70 electoral adapter: option_schema incompleto.");
  }
  return asArray(payload.options).map((raw, index) => {
    const row = asArray(raw);
    return {
      source: asString(row[sourceIndex], `Opción ${index + 1}`),
      key: asString(row[keyIndex], asString(row[sourceIndex], `OPTION_${index + 1}`)),
      municipalVotes: requiredNumber(row[votesIndex], `options[${index}].municipal_votes`),
      municipalShare: requiredNumber(row[shareIndex], `options[${index}].municipal_share`),
      municipalRank: requiredNumber(row[rankIndex], `options[${index}].municipal_rank`),
    };
  });
}

function rowToObject(schema: string[], raw: unknown): Dict {
  const values = asArray(raw);
  const output: Dict = {};
  schema.forEach((key, index) => {
    output[key] = values[index];
  });
  return output;
}

function centerMetrics(payload: Dict): Map<string, Dict> {
  const metrics = new Map<string, Dict>();
  const metricSchema = asArray(payload.center_metric_schema).map((item) => asString(item));
  if (metricSchema.length && Array.isArray(payload.center_metrics)) {
    for (const raw of payload.center_metrics) {
      const row = rowToObject(metricSchema, raw);
      const code = asString(row.code);
      if (!code || metrics.has(code)) throw new Error("V70 electoral adapter: center_metrics duplicado o sin código.");
      metrics.set(code, row);
    }
    return metrics;
  }

  const schema = asArray(payload.center_schema).map((item) => asString(item));
  if (schema.length && Array.isArray(payload.centers)) {
    for (const raw of payload.centers) {
      const full = rowToObject(schema, raw);
      const code = asString(full.code);
      if (!code || metrics.has(code)) throw new Error("V70 electoral adapter: centers duplicado o sin código.");
      metrics.set(code, {
        code,
        captured: full.captured,
        counted: full.counted,
        nominal: full.nominal,
        cast: full.cast,
        turnout: full.turnout,
        valid: full.valid,
        null: full.null,
        blank: full.blank,
        option_votes: full.option_votes,
        leader_key: full.leader_key,
        leader_votes: full.leader_votes,
        leader_share: full.leader_share,
        runner_key: full.runner_key,
        runner_votes: full.runner_votes,
        margin_votes: full.margin_votes,
        margin_share: full.margin_share,
        map_status: full.map_status,
      });
    }
  }
  return metrics;
}

function buildElectionSummary(code: V70ElectionCode, layer: AuthorizedLayerRecord | undefined): V70ElectionSummary {
  const availability = availabilityForLayer(layer);
  if (!layer?.payload) return emptyElection(code, availability);
  const payload = layer.payload;
  if (!isDict(payload)) return emptyElection(code, "SIN_REGISTRO");
  const election = isDict(payload.election) ? payload.election : null;
  if (!election) return emptyElection(code, "PARCIAL");
  const options = parseOptions(payload)
    .sort((a, b) => a.municipalRank - b.municipalRank || b.municipalVotes - a.municipalVotes)
    .slice(0, 10)
    .map((option) => ({ party: option.source, votes: option.municipalVotes, share: option.municipalShare, rank: option.municipalRank }));
  return {
    code,
    shortName: SHORT_NAME[code],
    name: asString(election.election_name, LONG_NAME[code]),
    expected: asNumber(election.expected_actas),
    counted: asNumber(election.counted_actas),
    countedShare: asNumber(election.counted_share),
    turnout: asNumber(election.turnout_counted),
    votesCast: asNumber(election.votes_cast_counted),
    optionVotes: asNumber(election.ballot_option_votes),
    leader: asNullableString(election.leader),
    leaderVotes: asNumber(election.leader_votes),
    leaderShare: asNumber(election.leader_share),
    runner: asNullableString(election.runner_up),
    runnerVotes: asNumber(election.runner_up_votes),
    marginVotes: asNumber(election.margin_votes),
    marginShare: asNumber(election.margin_share),
    top: options,
    availability,
    resultStatus: asNullableString(election.result_status),
  };
}

function buildCenterResult(
  code: V70ElectionCode,
  centerCode: string,
  expected: number,
  layer: AuthorizedLayerRecord | undefined,
): V70CenterElectionResult {
  const availability = availabilityForLayer(layer);
  if (!layer?.payload || !isDict(layer.payload)) return emptyCenterElection(expected, availability);
  const payload = layer.payload;
  const metrics = centerMetrics(payload);
  const row = metrics.get(centerCode);
  if (!row) return emptyCenterElection(expected, "PARCIAL");

  const options = parseOptions(payload);
  const matrix = isDict(payload.votes_matrix) ? payload.votes_matrix : null;
  const values = matrix ? asArray(matrix.values) : [];
  const centerOrder = [...metrics.keys()];
  const centerIndex = centerOrder.indexOf(centerCode);
  const votes = centerIndex >= 0 ? asArray(values[centerIndex]) : [];
  if (votes.length && votes.length !== options.length) {
    throw new Error(`V70 electoral adapter: matriz incompatible ${code}/${centerCode}.`);
  }
  const optionVotes = asNumber(row.option_votes);
  const ranked = votes.length
    ? tieAwareRanks(options.map((option, index) => {
        const voteCount = requiredNumber(votes[index], `${code}/${centerCode}/votes[${index}]`);
        return {
          party: option.source,
          votes: voteCount,
          share: optionVotes && optionVotes > 0 ? voteCount / optionVotes : 0,
        };
      }))
    : [];

  const leader = ranked[0] ?? null;
  const runner = ranked[1] ?? null;
  const storedLeader = asNullableString(row.leader_key);
  const storedLeaderVotes = asNumber(row.leader_votes);
  if (leader && storedLeaderVotes !== null && leader.votes !== storedLeaderVotes) {
    throw new Error(`V70 electoral adapter: líder inconsistente ${code}/${centerCode}.`);
  }

  return {
    counted: asNumber(row.counted),
    expected,
    turnout: asNumber(row.turnout),
    votesCast: asNumber(row.cast),
    optionVotes,
    nullVotes: asNumber(row.null),
    blankVotes: asNumber(row.blank),
    leader: leader?.party ?? storedLeader,
    leaderVotes: leader?.votes ?? storedLeaderVotes,
    leaderShare: leader?.share ?? asNumber(row.leader_share),
    runner: runner?.party ?? asNullableString(row.runner_key),
    runnerVotes: runner?.votes ?? asNumber(row.runner_votes),
    marginVotes: asNumber(row.margin_votes),
    marginShare: asNumber(row.margin_share),
    top: ranked.slice(0, 5),
    availability,
    mapStatus: asString(row.map_status, availability),
  };
}

export function adaptAuthorizedElectoralTerritoryLayers(layers: AuthorizedLayerRecord[]): V70ElectoralViewModel {
  const unique = new Map<string, AuthorizedLayerRecord>();
  for (const layer of layers) {
    if (unique.has(layer.layer_id)) throw new Error(`V70 electoral adapter: capa duplicada ${layer.layer_id}.`);
    unique.set(layer.layer_id, layer);
  }

  const indexLayer = unique.get("TREP_2023_CENTER_INDEX");
  if (!indexLayer?.payload || !isDict(indexLayer.payload)) {
    throw new Error("V70 electoral adapter: TREP_2023_CENTER_INDEX requerido.");
  }
  const index = indexLayer.payload;
  const municipalityCode = asString(index.municipality_code);
  if (!/^\d{4}$/.test(municipalityCode)) throw new Error("V70 electoral adapter: municipality_code inválido.");

  const resultLayers = Object.fromEntries(
    V70_ELECTION_ORDER.map((code) => [code, unique.get(RESULT_LAYER_BY_ELECTION[code])]),
  ) as Record<V70ElectionCode, AuthorizedLayerRecord | undefined>;

  const elections = V70_ELECTION_ORDER.map((code) => buildElectionSummary(code, resultLayers[code]));
  const indexCenters = asArray(index.centers);
  const seenCenterCodes = new Set<string>();
  const centers: V70ElectoralCenter[] = indexCenters.map((raw, position) => {
    if (!isDict(raw)) throw new Error(`V70 electoral adapter: centro ${position + 1} inválido.`);
    const id = asString(raw.voting_center_code);
    if (!id || seenCenterCodes.has(id)) throw new Error("V70 electoral adapter: código de centro duplicado o vacío.");
    seenCenterCodes.add(id);
    const expected = requiredNumber(raw.total_jrv, `${id}.total_jrv`);
    const geoSourceStatus = asString(raw.geo_association_status);
    const geoState: V70GeoState = geoSourceStatus === "ASSOCIATED_EXACT" ? "ASOCIACION_EXACTA" : "SIN_ASOCIACION";
    const centerElections = Object.fromEntries(
      V70_ELECTION_ORDER.map((code) => [code, buildCenterResult(code, id, expected, resultLayers[code])]),
    ) as Record<V70ElectionCode, V70CenterElectionResult>;
    return {
      id,
      stableId: asString(raw.center_id, `${municipalityCode}-${id}`),
      name: asString(raw.voting_center_name, `Centro ${id}`),
      community: asString(raw.community, "Sin registro"),
      type: asString(raw.institution_type, "Sin registro"),
      voters: asNumber(raw.registered_voters_center),
      jrv: expected,
      jrvRange: asString(raw.jrv_ranges),
      lat: asNumber(raw.latitude),
      lon: asNumber(raw.longitude),
      geoState,
      elections: centerElections,
    };
  });

  const missingLayers = V70_ELECTION_ORDER
    .map((code) => RESULT_LAYER_BY_ELECTION[code])
    .filter((layerId) => !unique.has(layerId));
  const geoExact = centers.filter((center) => center.geoState === "ASOCIACION_EXACTA").length;
  const geoHeld = centers.length - geoExact;
  const allPublished = elections.every((election) => election.availability === "PUBLICADO");

  return {
    municipalityCode,
    municipalityName: asString(index.municipality_name),
    departmentName: asString(index.department_name),
    snapshot: asNullableString(index.snapshot),
    resultStatus: asNullableString(index.result_status),
    elections,
    centers,
    qa: {
      status: allPublished && missingLayers.length === 0 ? "PASS" : "PARTIAL",
      missingLayers,
      geoExact,
      geoHeld,
    },
  };
}
