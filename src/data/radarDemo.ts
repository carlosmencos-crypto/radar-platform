export function assertDemoContext(context: { is_demo?: boolean; campaign_id?: string | null; municipality_code?: string }, code: string, expectedCampaign?: string) {
  if (context.is_demo !== true || !context.campaign_id || context.municipality_code !== code || (expectedCampaign && context.campaign_id !== expectedCampaign)) {
    throw new Error("RADAR_DEMO_CONTEXT_REQUIRED");
  }
}
