import { supabase } from "../lib/supabase";
import type { DemoActivity, DemoContact, RadarDemoBundle } from "../types/radar";

function requireClient() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

function assertBundle(value: unknown): RadarDemoBundle {
  const bundle = value as Partial<RadarDemoBundle> | null;
  if (!bundle?.campaign?.is_demo) throw new Error("La campaña autorizada no es una demo activa.");
  for (const key of [
    "geo_features", "candidates", "contacts", "fiscales", "activities", "incidents",
    "rtd_results", "commitments", "resources", "strategy_items", "pulse_snapshots",
  ] as const) {
    if (!Array.isArray(bundle[key])) throw new Error(`Dataset demo inválido: ${key}.`);
  }
  return bundle as RadarDemoBundle;
}

export async function loadDemoBundle(campaignId: string) {
  const { data, error } = await requireClient().rpc("radar_demo_bundle", { target_campaign: campaignId });
  if (error) throw error;
  return assertBundle(data);
}

export type ContactDraft = Pick<DemoContact, "full_name" | "phone" | "community" | "address_text" | "status" | "notes">;

export async function saveDemoContact(campaignId: string, id: string | null, contact: ContactDraft) {
  const { data, error } = await requireClient().rpc("radar_demo_save_contact", {
    target_campaign: campaignId,
    target_id: id,
    contact,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteDemoContact(campaignId: string, id: string) {
  const { error } = await requireClient().rpc("radar_demo_delete_contact", {
    target_campaign: campaignId,
    target_id: id,
  });
  if (error) throw error;
}

export type ActivityDraft = Pick<DemoActivity, "title" | "activity_type" | "starts_at" | "community" | "latitude" | "longitude" | "status" | "notes">;

export async function saveDemoActivity(campaignId: string, id: string | null, activity: ActivityDraft) {
  const { data, error } = await requireClient().rpc("radar_demo_save_activity", {
    target_campaign: campaignId,
    target_id: id,
    activity,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteDemoActivity(campaignId: string, id: string) {
  const { error } = await requireClient().rpc("radar_demo_delete_activity", {
    target_campaign: campaignId,
    target_id: id,
  });
  if (error) throw error;
}
