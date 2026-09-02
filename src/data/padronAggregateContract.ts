export interface PadronMunicipalAggregate2023 {
  municipalityCode: string;
  electorCount: number;
  communityCount: number;
  averageAgeBase: number;
  ageMissingCount: number;
  age18To29: number;
  age30To44: number;
  age45To59: number;
  age60Plus: number;
  sourceYear: 2023;
}

export interface PadronMunicipalAggregateResponse {
  data: PadronMunicipalAggregate2023;
  productId: "GT_RADAR_PADRON_2023_AGGREGATES_v1";
  privacyClass: "AGGREGATE_ONLY";
}

const municipalityCodePattern = /^\d{4}$/;

const assertAggregateResponse = (
  payload: unknown,
  expectedMunicipalityCode: string,
): PadronMunicipalAggregateResponse => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Respuesta agregada inválida");
  }

  const candidate = payload as Partial<PadronMunicipalAggregateResponse>;
  if (
    candidate.productId !== "GT_RADAR_PADRON_2023_AGGREGATES_v1"
    || candidate.privacyClass !== "AGGREGATE_ONLY"
    || candidate.data?.municipalityCode !== expectedMunicipalityCode
    || candidate.data?.sourceYear !== 2023
  ) {
    throw new Error("Contrato agregado no reconciliado");
  }

  return candidate as PadronMunicipalAggregateResponse;
};

/**
 * Reads one aggregate municipal record from the authenticated backend.
 * The 340-row snapshot and every individual elector record must remain outside
 * the public frontend bundle and outside this repository.
 */
export const fetchPadronMunicipalAggregate2023 = async (
  municipalityCode: string,
  signal?: AbortSignal,
): Promise<PadronMunicipalAggregateResponse> => {
  if (!municipalityCodePattern.test(municipalityCode)) {
    throw new Error("municipality_code inválido");
  }

  const response = await fetch(
    `/api/padron-aggregate/municipal/${encodeURIComponent(municipalityCode)}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`No fue posible cargar el agregado municipal (${response.status})`);
  }

  return assertAggregateResponse(await response.json(), municipalityCode);
};
