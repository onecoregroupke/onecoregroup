import type { ManualDocument } from '../model'

/**
 * NUURA NEST (§30).
 *
 * The source material for Nuura is genuinely thinner than for the other
 * entities. This manual therefore describes only what the existing application
 * and current records actually support: a property/unit register maintained as
 * a read-only admin cockpit, listing content edited in the Marketing Hub, and
 * income categorised per accommodation unit in the group reconciliation.
 *
 * Where a workflow is not present in code or in source records, this manual
 * says so. It deliberately does NOT fill the gap with generic hospitality
 * theory — an invented procedure in an operating manual is worse than an
 * acknowledged gap, because someone will eventually follow it.
 */
export const nuuraNestManual: ManualDocument = {
  ref: 'nuura-nest',
  title: 'Nuura Nest Operating System',
  entity: 'Nuura Nest Stays',
  intro:
    'Nuura Nest Stays operates short-stay accommodation. This manual describes the operation as the current system supports it: the property ' +
    'register, stewardship of listing content, income categorisation and reconciliation, and the property work that runs through the shared duty ' +
    'and task systems. It is the shortest entity manual because it is limited to what is actually recorded — the gaps are named rather than filled.',

  chapters: [
    {
      id: 'scope',
      title: 'Scope of this manual',
      summary: 'What is recorded, and what is not yet.',
      blocks: [
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Deliberately incomplete',
          text:
            'Several operations a short-stay business normally runs — guest booking, check-in and check-out, housekeeping turnaround scheduling, ' +
            'rate management and channel distribution — are not currently modelled in the platform and are not documented in the available source ' +
            'records. They are listed in "Not yet formally defined" rather than described, because writing a plausible procedure the business has ' +
            'not agreed would be an invention, not a manual.',
        },
        {
          kind: 'paragraph',
          text:
            'What follows is what the system and the records genuinely support today. As Nuura\'s operations are recorded, this manual should grow ' +
            'by confirmation rather than by assumption.',
        },
      ],
    },

    {
      id: 'portfolio',
      title: 'The property portfolio',
      summary: 'The unit register and what it holds.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Maintain an accurate register of the accommodation units the business operates, and their current status.' },
            { label: 'Records', value: 'The property register: unit name, description, nightly rate, amenities, images, active and featured status.' },
            { label: 'Management control', value: 'The admin view is read-only by design; content changes go through the Marketing Hub so listing copy and photographs have one editing path.' },
            { label: 'In the system', value: 'The Nuuranest admin cockpit, showing unit count, active units, featured units and average nightly rate.' },
          ],
        },
        {
          kind: 'paragraph',
          text:
            'A unit that is not active in the register is not being offered. Activating or deactivating a unit is therefore an operational decision, ' +
            'not a cosmetic one.',
        },
        { kind: 'systemLink', href: '/nuuranest', label: 'Nuuranest admin', description: 'The short-stay portfolio at a glance.' },
      ],
    },

    {
      id: 'listing-stewardship',
      title: 'Listing content stewardship',
      summary: 'Who edits what a guest sees.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Listing content — descriptions, photographs, amenities and pricing — is edited in the Marketing Hub under Properties, not in the ' +
            'operations cockpit. This keeps one editing path for anything a prospective guest reads, and keeps the operational view a reporting ' +
            'surface rather than a second place to change a price.',
        },
        {
          kind: 'list',
          items: [
            'Descriptions and amenity lists kept accurate to the unit as it actually is.',
            'Photographs current — a listing showing a previous configuration generates complaints, not bookings.',
            'Nightly rate maintained in one place.',
            'Active and featured status reflecting what the business wants to sell now.',
          ],
        },
      ],
    },

    {
      id: 'income',
      title: 'Income categorisation and reconciliation',
      summary: 'How Nuura income reaches the group position.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Nuura is a distinct entity in the group income reconciliation. Income is categorised against the entity and against the respective ' +
            'accommodation unit, so revenue can be read per property rather than only in total.',
        },
        {
          kind: 'flow',
          title: 'Into the group position',
          steps: [
            'Income received',
            'Recognised source record and receipt',
            'Categorised by entity and by accommodation unit',
            'Reconciled against the mobile-money or bank statement',
            'Discrepancies followed up',
            'Reconciled position registered in the controlled system',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'This follows the group finance reconciliation cycle exactly; Nuura is not a special case. What is specific to Nuura is the second ' +
            'categorisation dimension — the unit — which is what makes per-property performance visible.',
        },
        { kind: 'systemLink', href: '/finance', label: 'Finance' },
      ],
    },

    {
      id: 'expenses',
      title: 'Expenses and petty cash',
      summary: 'Money out.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Property expenses follow the group controls: purchases receipted, vote heads allocated, supporting evidence attached, and petty-cash ' +
            'floats reconciled on their cycle.',
        },
        { kind: 'systemLink', href: '/petty-cash', label: 'Petty Cash' },
        { kind: 'knowledge', titles: ['Petty Cash Float Cycle and Supporting Evidence'] },
      ],
    },

    {
      id: 'property-work',
      title: 'Property work, readiness and maintenance',
      summary: 'How work on a unit is assigned and recorded.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Work on a property runs through the shared work systems rather than a Nuura-specific one. Recurring work — readiness checks, periodic ' +
            'maintenance — is configured as a Duty. One-off work — a repair, a replacement, a specific preparation — is an Assigned Task, and can be ' +
            'scheduled to a time on the Calendar.',
        },
        {
          kind: 'list',
          items: [
            'Recurring property routines: configured in Duty Management, completed in My Work with a note and evidence where required.',
            'One-off property work: assigned from the Task Board or from a Calendar day, with a schedule and a deadline.',
            'Maintenance requiring purchase follows the normal procurement route.',
          ],
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work' },
        { kind: 'systemLink', href: '/calendar', label: 'Calendar' },
        { kind: 'systemLink', href: '/management/duties', label: 'Duty Management' },
      ],
    },

    {
      id: 'management-review',
      title: 'Management review',
      summary: 'What is reviewed and where.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Portfolio position: units active, units featured, average nightly rate.',
            'Income per unit through the group reconciliation.',
            'Outstanding property work through duties and tasks.',
            'Submitted work requiring countersignature, through the review queue.',
          ],
        },
      ],
    },

    {
      id: 'gaps',
      title: 'Not yet formally defined',
      summary: 'Operations this manual deliberately does not describe.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The following are not currently modelled in the platform and are not described in the available records. They are recorded here as ' +
            'known gaps so management can decide whether to define them, rather than being quietly invented.',
        },
        {
          kind: 'list',
          items: [
            'Guest booking and reservation handling.',
            'Check-in and check-out procedure.',
            'Housekeeping turnaround scheduling between stays.',
            'Guest communication before, during and after a stay.',
            'Rate management and seasonal pricing rules.',
            'Distribution across booking channels and channel reconciliation.',
            'Damage, deposit and incident handling.',
            'Guest feedback and review handling.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Where any of these is already happening in practice, describing it and recording it as approved Knowledge is the route to getting it ' +
            'into this manual — at which point the corresponding line above should be removed.',
        },
      ],
    },

    {
      id: 'live-data',
      title: 'Current entity data',
      summary: 'Live structured records for Nuura Nest.',
      blocks: [
        { kind: 'dynamic', source: 'people', title: 'People assigned to Nuura Nest' },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
      ],
    },
  ],
}
