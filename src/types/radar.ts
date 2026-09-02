import type { Municipality } from "./territory";

export type AvailabilityState = "disponible" | "parcial" | "pendiente" | "no_publicado";
export type UserRole = "public_viewer" | "municipal_admin" | "campaign_operator" | "national_admin";

export interface RadarContextKey {
  municipality_code: string;
  campaign_id: string;
  user_role: UserRole;
  permissions: string[];
}

export interface ConsumerModule {
  id: string;
  label: string;
  state: AvailabilityState;
  vault: "data" | "campaign";
  source?: string;
}

export interface RadarMunicipalConsumer {
  context: RadarContextKey;
  municipality: Municipality;
  modules: ConsumerModule[];
}

