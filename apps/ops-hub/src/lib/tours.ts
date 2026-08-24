// Product-tour definitions for the Ops Hub. Each tour is a list of steps; a step
// can target a CSS selector (highlighted with a spotlight) or be target-less
// (shown as a centred card). Tours are launched from the floating help button and
// are fully repeatable so the team can run them any time to learn the system.

export interface TourStep {
  title: string
  body: string
  target?: string // CSS selector; if missing/not found, the card centres
}

export interface TourDef {
  id: string
  label: string
  steps: TourStep[]
}

// A short overview tour built on the global sidebar — works on every page.
const OVERVIEW: TourDef = {
  id: 'overview',
  label: 'Ops Hub overview',
  steps: [
    { title: 'Welcome to the Ops Hub', body: 'This is One Core Group’s operations cockpit — tasks, the brand mini-systems, schools, and management all live here. Use Next to take the tour; you can repeat it any time from the “?” button.' },
    { title: 'Dashboard', body: 'Your home view: what’s due, what’s blocked, and overall delivery across the six brands.', target: '[data-tour="nav-/"]' },
    { title: 'Management', body: 'The director cockpit — approvals, blockers, decisions, and the team.', target: '[data-tour="nav-/management"]' },
    { title: 'Team & Portal Access', body: 'Invite team members to their portal, set what they can access, change emails, resend invites, and see who has accepted and signed in.', target: '[data-tour="nav-/management/users"]' },
    { title: 'Duty Management', body: 'Configure the recurring responsibilities that come with a role, and countersign what your team submits. These are duties, not one-off tasks.', target: '[data-tour="nav-/management/duties"]' },
    { title: 'My Work', body: 'Every team member’s one place for the day: their recurring Daily Duties, the Assigned Tasks management gave them, appointments, and anything overdue — updated from their phone.', target: '[data-tour="nav-/my-work"]' },
    { title: 'Task Board', body: 'Management’s coordination of assigned tasks across the group, filterable by brand and status.', target: '[data-tour="nav-/tasks"]' },
    { title: 'NPT Service', body: 'The piano service desk — customers, pianos, jobs, scheduling, quotes, invoices, and reminders.', target: '[data-tour="nav-/npt"]' },
    { title: 'Schools', body: 'Rayyan, Rhythms, and Darul Swafa each have a full admin module — students, classes, admissions, fees, and reports.', target: '[data-tour="nav-/rayyan"]' },
    { title: 'You’re set', body: 'That’s the lay of the land. Open any module and tap the “?” button for a tour of that area.' },
  ],
}

// Per-module tours. Keyed by the path prefix they apply to.
const MODULE_TOURS: { match: string; tour: TourDef }[] = [
  {
    match: '/management/users',
    tour: {
      id: 'portal-access',
      label: 'Portal access tour',
      steps: [
        { title: 'Team portal & access', body: 'Invite people to their own portal and control exactly what each person can see and do.' },
        { title: 'Invite to portal', body: 'Send a branded invite. They get an email to set a password and activate their portal.', target: '[data-tour="invite-btn"]' },
        { title: 'Who has access', body: 'Each person shows ACCEPTED once they set their password, and you can see their last portal sign-in. Use Resend to re-send an invite or a reset link, and Revoke to cut access instantly.' },
      ],
    },
  },
  {
    match: '/management/duties',
    tour: {
      id: 'duties',
      label: 'Daily duties tour',
      steps: [
        { title: 'Daily duties', body: 'Set up the duties each person should do every day. They tick them off in their portal.' },
        { title: 'Add a duty', body: 'Pick a person, name the duty, and save. It appears in their portal every day.', target: '[data-tour="duty-setup"]' },
        { title: 'Track progress', body: 'See live, per-person, who has completed today’s duties. This same summary is included in the end-of-day report.' },
      ],
    },
  },
  {
    match: '/darul',
    tour: {
      id: 'darul',
      label: 'Darul Swafa tour',
      steps: [
        { title: 'Darul Swafa Madrassa', body: 'The full madrassa admin layer — students, halaqas, hifz progress, admissions, and fees.' },
        { title: 'Quick add', body: 'Use this panel to add students, parents, halaqas, hifz milestones, fee invoices, and record payments.', target: '[data-tour="quick-add"]' },
        { title: 'Fees', body: 'Fees are manual (M-Pesa / cash / bank). Record a payment against an invoice and the balance and status update automatically.' },
      ],
    },
  },
]

export function tourForPath(path: string): TourDef {
  const hit = MODULE_TOURS.find((m) => path === m.match || path.startsWith(`${m.match}/`) || path.startsWith(m.match))
  return hit?.tour ?? OVERVIEW
}
