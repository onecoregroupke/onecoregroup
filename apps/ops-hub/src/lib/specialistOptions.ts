// Client-safe specialist picklist. The authoritative profiles (runtime,
// risk, expected output) live in lib/agents/specialistRegistry.ts (server).
export const SPECIALIST_OPTIONS: { value: string; label: string }[] = [
  { value: 'analysis', label: 'Analysis' },
  { value: 'research', label: 'Research' },
  { value: 'report', label: 'Report / Executive summary' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'content', label: 'Content plan (marketing)' },
  { value: 'video_clipping', label: 'Video clipping plan' },
  { value: 'design_deck', label: 'Design deck' },
  { value: 'client_communication', label: 'Client message draft' },
  { value: 'email_draft', label: 'Email draft' },
  { value: 'project_admin', label: 'Project admin / breakdown' },
]
