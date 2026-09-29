import type { CampaignActivityRecord } from "./radarRuntime";
export function matchesAgendaFilters(activity: CampaignActivityRecord, person: string, status: string) {
  const details = activity.details ?? {};
  const participants = Array.isArray(details.participant_ids) ? details.participant_ids : [];
  return (!person || details.responsible_person_id === person || participants.includes(person))
    && (!status || activity.status?.toUpperCase() === status);
}
