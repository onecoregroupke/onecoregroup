import type { ManualDocument } from '../model'

/**
 * ONE CORE GROUP — the group operating manual (§§10–13).
 *
 * Sources: the current Ops Hub operating architecture (what the code actually
 * does), management-provided operational records, and employee routine records.
 * Where something is not yet formally recorded, it says so rather than
 * inventing a procedure.
 */
export const groupManual: ManualDocument = {
  ref: 'one-core-group',
  title: 'One Core Group Operating System',
  entity: 'One Core Group',
  intro:
    'One Core Group is a Kenyan multi-entity operation running six brands on one shared management and operations platform. ' +
    'This manual describes how the group actually works: which functions exist, who is responsible for what, which routines recur, ' +
    'which records prove work happened, and how management verifies it. It is written to be used, not filed.',

  chapters: [
    {
      id: 'how-to-use',
      title: 'How to use this manual',
      summary: 'What this document is, what it is not, and how it relates to Knowledge.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'This Operating System answers one question: how does this company operate? It connects structure, functions, roles, ' +
            'responsibilities, recurring routines, controls, source records, escalation and management review into one readable account.',
        },
        {
          kind: 'paragraph',
          text:
            'It is not the policy library. Individual policies, SOPs, instructions, training material and reference documents live in ' +
            'Knowledge, where each one is versioned and approved on its own. This manual links to those documents; it does not replace them ' +
            'and does not copy them.',
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Working draft',
          text:
            'This is version 1. It is compiled partly from historical operating material and from records that predate the current platform. ' +
            'It is accurate enough to work from today, but it is not yet approved policy. Where a procedure still needs management confirmation, ' +
            'the manual says so explicitly instead of presenting an old rule as a current one.',
        },
        {
          kind: 'systemLink',
          href: '/knowledge',
          label: 'Company Knowledge',
          description: 'The versioned policy, SOP and reference library that supports this manual.',
        },
      ],
    },

    {
      id: 'operating-principles',
      title: 'Operating principles',
      summary: 'The rules the whole platform is built on.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The platform is the operational source of truth for current work. Paper books and spreadsheets remain valid as historical ' +
            'source evidence, and some are still in use during transition, but where the two disagree about live work, the platform is the record.',
        },
        {
          kind: 'list',
          items: [
            'Operations and records are scoped to an entity. A person sees the entities they work for.',
            'Responsibilities are explicit. Work that belongs to nobody does not get done.',
            'Capability is separate from authority. Being able to do something is not permission to approve it.',
            'Recurring Duties are separate records from one-off Assigned Tasks, and stay separate.',
            'Operational forms are controlled documents; posting one moves the underlying ledger.',
            'Finance, procurement and inventory keep their own source records; summaries are derived from them, never typed over them.',
            'Detailed records sit beneath every management summary, and can be opened from it.',
            'Work that requires approval is countersigned by a named reviewer, and the countersignature is immutable.',
            'Knowledge is versioned. A superseded policy is superseded, not deleted.',
            'Historical records are auditable and are loaded under governance, not pasted in.',
            'Access follows role and scope, and is enforced on the server rather than by hiding buttons.',
          ],
        },
      ],
    },

    {
      id: 'four-concepts',
      title: 'Responsibility, capability, authority, activity',
      summary: 'Four different things that are routinely confused.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Most operational disputes come from treating these four as one. The platform models them separately and so does this manual.',
        },
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Responsibility — what a person is expected to do. It comes from their role, their post, their department or their routine.' },
            { label: 'Normal flow', value: 'Capability — what a person can competently perform. Recorded, and verifiable, but it grants nothing on its own.' },
            { label: 'Responsible', value: 'Authority — what a person is permitted to review, approve, authorise, post, adjust or reverse, and within what scope and limit.' },
            { label: 'Records', value: 'Activity — what actually happened. Completion records, forms, movements, receipts, review events.' },
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'A storekeeper may be fully capable of approving a purchase and still have no authority to do so. Nothing in the system derives ' +
            'authority from capability, and no trigger or view connects them.',
        },
        {
          kind: 'dynamic',
          source: 'authorities',
          title: 'Recorded authorities',
          description: 'Who may prepare, review, approve, authorise, post, adjust or reverse — as currently granted.',
        },
      ],
    },

    {
      id: 'group-functions',
      title: 'Group and cross-entity functions',
      summary: 'The shared functions that serve more than one entity.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Some functions belong to the group rather than to a single entity, and serve several brands at once. They keep entity-scoped ' +
            'records — a shared function does not mean a shared ledger.',
        },
        {
          kind: 'list',
          items: [
            'Management — direction, approvals, blockers, decisions and review.',
            'Finance and account reconciliation — income, receipts, statements and categorisation across entities.',
            'Petty cash — floats, vouchers, vote heads and supporting evidence.',
            'People and duties — the employee record, responsibilities, capabilities, authorities and recurring duties.',
            'Calendar and work coordination — scheduling, meetings and assignment.',
            'Facilities and shared support — grounds, cleaning, kitchen and shared premises.',
            'Marketing and content — brand content, scheduling and publishing.',
            'Operational reporting — daily, weekly and monthly narration over completed work.',
            'Knowledge — the versioned policy and reference library.',
            'Historical data governance — controlled loading of past records.',
          ],
        },
        { kind: 'dynamic', source: 'systems', title: 'Operational systems in use' },
      ],
    },

    {
      id: 'my-work',
      title: 'My Work: duties, tasks and personal work',
      summary: 'The four work concepts an employee sees, and why they stay distinct.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Give every employee one place that answers "what do I need to do today?" without merging the underlying records.' },
            { label: 'Normal flow', value: 'The employee opens My Work; Today shows overdue work first, then Daily Duties, then Assigned Tasks, then appointments.' },
            { label: 'Records', value: 'Duty occurrences in the duty log; assigned tasks in the task register. Two record types, one view.' },
            { label: 'In the system', value: 'My Work, with Duties, Assigned Tasks and Completed tabs.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Daily Duties — recurring responsibilities that come with a role, a post, a location or a routine. Configured by management, derived per day, never pre-generated into the future.',
            'Assigned Tasks — specific one-off work management gives to a named person. Created on the Task Board or from the Calendar.',
            'Personal — the employee\'s own private to-do list. It is not company work and is not visible to management.',
            'My Work — the employee\'s unified view of the first two, plus appointments and anything overdue.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Why they are not merged',
          text:
            'A duty and a task answer different management questions. "Is the opening stock check happening every day?" is a duty question. ' +
            '"Did Wallace finish the supplier comparison?" is a task question. Merging them into one generic work table would destroy both answers. ' +
            'The morning brief and My Work combine them for the reader while leaving the records alone.',
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work' },
        { kind: 'systemLink', href: '/management/duties', label: 'Duty Management', description: 'Configure recurring responsibilities and countersign submitted work.' },
        { kind: 'systemLink', href: '/tasks', label: 'Task Board', description: 'Management coordination of assigned tasks.' },
        { kind: 'knowledge', titles: ['Tasks, Personal Tasks and Daily Duties'] },
      ],
    },

    {
      id: 'scheduled-work',
      title: 'Scheduling work and deadlines',
      summary: 'When work should be done, versus when it is due.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'A task carries two independent time facts. Its schedule is when management expects the person to perform the work. Its deadline ' +
            'is the date by which it must be finished. They are frequently different, and conflating them produces either a false sense of ' +
            'urgency or a missed commitment.',
        },
        {
          kind: 'list',
          items: [
            'Scheduled Wednesday 10:00–12:00, due Friday — a booked working session with a later deadline.',
            'Scheduled and due the same day — a fixed appointment-like commitment.',
            'A deadline with no schedule — the person decides when to fit it in.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'A scheduled task appears on the Calendar in its time slot, exactly like an event, and appears in My Work on the day it is ' +
            'scheduled even when its deadline is later. It is still one task record — the Calendar is an input and display surface, not a ' +
            'second work system.',
        },
        { kind: 'systemLink', href: '/calendar', label: 'Calendar' },
      ],
    },

    {
      id: 'review-countersign',
      title: 'Management review and countersignature',
      summary: 'How submitted work is verified, and by whom.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Ensure that work requiring verification is actually checked by a person with the authority to check it, and that the check leaves a permanent record.' },
            { label: 'Normal flow', value: 'Employee submits → occurrence moves to Pending Review → the named reviewer inspects note, checklist, evidence and any required form → Accept or Reopen.' },
            { label: 'Responsible', value: 'The named reviewer where one is configured on the duty or task. Where none is configured, appropriately authorised management within the relevant entity scope.' },
            { label: 'Records', value: 'The review verdict on the occurrence, plus an immutable review event recording who signed, when, and with what comment.' },
            { label: 'Management control', value: 'The review queue shows only work the viewer is genuinely authorised to decide. Another manager does not see a named reviewer\'s items as actionable.' },
            { label: 'Escalation', value: 'Reopened work returns to the employee with a written reason. A reviewer who has left is replaced by editing the duty or task, which is audited — not by overriding the reservation.' },
          ],
        },
        {
          kind: 'flow',
          title: 'Countersign',
          steps: [
            'Employee completes and submits',
            'Pending review',
            'Named reviewer inspects evidence',
            'Accept or Reopen',
            'Immutable review event recorded',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'No self-countersignature',
          text:
            'Nobody may review their own work — not a manager, not a director, not the founding administrator. The rule is enforced on the ' +
            'server against stable employee identity, not against display names, so two people who share a name cannot sign for each other.',
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'The verdict and its audit event are written in one database transaction. If the audit record cannot be written, the verdict does ' +
            'not commit. A countersignature that exists in the portal but not in the audit trail would be worse than no countersignature at all.',
        },
        { kind: 'knowledge', titles: ['Group Management and Operational Control'] },
      ],
    },

    {
      id: 'morning-brief',
      title: 'The morning work brief',
      summary: 'One email per person per working morning.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'On weekday mornings each employee receives a single brief covering their whole day: outstanding Daily Duties, open Assigned Tasks ' +
            'including any scheduled time, appointments booked for the day, anything overdue, and any reviews reserved for them by name.',
        },
        {
          kind: 'list',
          items: [
            'Duties already completed before the brief is generated are excluded.',
            'Overdue work is chased once, from the overdue section, not twice.',
            'A person with nothing actionable receives no email. A daily "you have nothing" trains people to stop reading.',
            'The brief links to My Work; it does not carry a second copy of the work.',
          ],
        },
      ],
    },

    {
      id: 'finance-reconciliation',
      title: 'Group finance and account reconciliation',
      summary: 'Cross-entity income, receipts, statements and categorisation.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'A cross-entity reconciliation function covers student payments for the schools, petty cash, daily income across entities, mobile-money ' +
            'and bank statement reconciliation, receipt-book reconciliation, income categorisation, supporting evidence, annual tax work and one-off ' +
            'account reconciliations.',
        },
        {
          kind: 'flow',
          title: 'Reconciliation cycle',
          steps: [
            'Retrieve receipt books and statements',
            'Update student and payment ledgers',
            'Reconcile against mobile-money and bank statements',
            'Identify unmatched receipts and unmatched statement lines',
            'Follow up discrepancies',
            'Categorise income by entity and income class',
            'Attach supporting evidence',
            'Register the reconciled position in the controlled system',
          ],
        },
        {
          kind: 'list',
          items: [
            'Petty-cash voucher allocations are updated and receipts attached as supporting evidence.',
            'Vote heads are allocated so spend is classified consistently across entities.',
            'Floats are reconciled on their cycle rather than at year end.',
            'During transition both the appropriate hardcopy source document and the current digital record are maintained.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Direction of travel',
          text:
            'The platform is progressively replacing duplicate spreadsheets. Where a controlled spreadsheet is still in use it remains a valid ' +
            'source document, but the intent is that the reconciled position lives in the system, not in a parallel file.',
        },
        { kind: 'systemLink', href: '/finance', label: 'Finance' },
        { kind: 'systemLink', href: '/petty-cash', label: 'Petty Cash' },
        { kind: 'knowledge', titles: ['Petty Cash Float Cycle and Supporting Evidence'] },
      ],
    },

    {
      id: 'procurement-inventory',
      title: 'Procurement, receiving and inventory control',
      summary: 'How goods enter the group and how stock stays true.',
      blocks: [
        {
          kind: 'flow',
          title: 'Goods in',
          steps: [
            'Requirement identified',
            'Requisition raised',
            'Approved procurement',
            'Supplier order',
            'Goods Received Note',
            'Stock register updated',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Every posted operational form writes one movement line per item, carrying the id of the document that caused it. The stock card is ' +
            'a view over that ledger, so opening, in, out and closing recalculate the moment a form is posted. There is no batch job and no second ' +
            'copy of the numbers to fall out of step.',
        },
        {
          kind: 'callout',
          tone: 'warning',
          text:
            'Nothing outside the ledger should maintain a stock balance. A spreadsheet total that disagrees with the stock card is not a second ' +
            'opinion; it is an error waiting to be discovered during a count.',
        },
        { kind: 'systemLink', href: '/inventory', label: 'Inventory' },
        { kind: 'systemLink', href: '/inventory/stock-cards', label: 'Stock cards', description: 'Opening · In · Out · Closing per item for any period.' },
        { kind: 'systemLink', href: '/procurement', label: 'Procurement' },
        { kind: 'knowledge', titles: ['Procurement, Receiving and Inventory Control'] },
      ],
    },

    {
      id: 'operational-forms',
      title: 'Operational forms and controlled documents',
      summary: 'The paper pads, digitised, with the ledger behind them.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Operational forms carry the same fields, in the same order, as the physical pads they replace, and each states what it will do to ' +
            'stock before it is submitted. Submitting one posts the corresponding movement through the single inventory ledger.',
        },
        {
          kind: 'list',
          items: [
            'Goods Received Note — goods in from a supplier.',
            'Goods / Raw Material Issue Note — stock out to production or to a job.',
            'Goods Transfer Note — stock moved between stores.',
            'Material Requisition — a request for material.',
            'Invoice — a sale to a customer.',
            'Delivery Note — stock issued into a sales team\'s custody.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'One entity per document',
          text:
            'A document\'s letterhead, its items, its stores and its numbering all resolve from the same entity. A form is never issued with one ' +
            'company\'s identity over another company\'s goods; where the entity is ambiguous the system asks rather than guessing.',
        },
        { kind: 'systemLink', href: '/forms', label: 'Forms', description: 'Configurable reporting forms and registers.' },
        { kind: 'knowledge', titles: ['Forms and Operational Records'] },
      ],
    },

    {
      id: 'people-duties',
      title: 'People, responsibilities and duties',
      summary: 'How the employee record drives the work.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Each employee record carries their entity assignments, department, role, reporting line, responsibilities, recorded capabilities and ' +
            'granted authorities. Recurring duties target people through that structure — an individual, a team, a department, a role, a location ' +
            'or an entity — so a duty follows the post rather than being re-typed whenever someone changes job.',
        },
        {
          kind: 'list',
          items: [
            'A group-targeted duty produces one occurrence per person per due day, never a shared one.',
            'A duty that resolves to nobody surfaces as unassigned so it is visible, rather than silently vanishing.',
            'Cover is recorded against the occurrence, keeping the original owner and the reason.',
            'Duties may require a note, a checklist, evidence, a specific form, or management approval before they can be completed.',
          ],
        },
        {
          kind: 'dynamic',
          source: 'people',
          title: 'People and responsibility map',
          description: 'Employees assigned to the group, with their roles, responsibilities, capabilities and authorities as currently recorded.',
        },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'systemLink', href: '/management/team', label: 'Team' },
      ],
    },

    {
      id: 'reporting',
      title: 'Operational reporting',
      summary: 'What management reads, and what sits underneath it.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Daily, weekly and monthly reports narrate completed tasks and project updates for the period. Every figure in a management summary ' +
            'is derived from the operational records beneath it and can be opened down to the individual completion, form or movement.',
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Reporting is the one place the group uses a language model, and only to narrate records that already exist. It never creates, ' +
            'approves or alters an operational record.',
        },
        { kind: 'systemLink', href: '/management/analytics', label: 'Analytics' },
      ],
    },

    {
      id: 'historical-data',
      title: 'Historical data and record integrity',
      summary: 'How past records are loaded without corrupting current ones.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Historical operating records are loaded under governance: uploaded, parsed, mapped, validated, reviewed, approved, posted, reconciled ' +
            'and finally locked. A batch that fails validation does not post. Loading is idempotent, so a repeated file does not double-count.',
        },
        {
          kind: 'callout',
          tone: 'warning',
          text:
            'Historical material is registered as historical. Importing a past procedure does not make it current policy, and a legacy document ' +
            'is never silently promoted to an approved current version.',
        },
        { kind: 'systemLink', href: '/historical-imports', label: 'Historical Imports' },
        { kind: 'knowledge', titles: ['Historical Data Loading and Record Integrity'] },
      ],
    },

    {
      id: 'access',
      title: 'Access, scope and enforcement',
      summary: 'Who can see and do what.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Module access is granted per section, at view or edit level.',
            'Brand scoping narrows a section to specific entities — this is how a per-entity accountant or storekeeper is created.',
            'A record horizon controls how far inside a module a person can see: their own records, their department, management level, or the whole group.',
            'Authority grants control what a person may approve, post, adjust or reverse, and within what limit.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Hiding a button is not security',
          text:
            'Every scope rule is enforced on the server. The interface hides what a person cannot use as a courtesy, but a crafted request is ' +
            'refused by the same check that decided what to show.',
        },
        { kind: 'systemLink', href: '/management/users', label: 'Portal Access' },
      ],
    },

    {
      id: 'shared-services',
      title: 'Shared kitchen and facilities support',
      summary: 'Support routines serving several entities on one site.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'A shared kitchen and facilities function serves children, staff and some production staff across the shared premises. The routine ' +
            'covers early opening and surface cleaning, fetching and filling cooking and washing water, preparing vegetables, staff and children\'s ' +
            'breakfast, lunch, cereals and other prepared meals, serving, utensil control, kitchen cleaning, fruit, weekly vegetable arrangement, ' +
            'supply timing, and closing the kitchen clean.',
        },
        {
          kind: 'list',
          items: [
            'Utensils are controlled to prevent unauthorised removal or loss.',
            'Supply timing is planned weekly rather than daily where the item allows it.',
            'Kitchen staff support daycare when teaching staff are absent, under the school\'s supervision.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Menus are operational practice, not policy. This manual records the routine and its controls; it does not fix a menu as a rule.',
        },
        {
          kind: 'paragraph',
          text:
            'Grounds and facilities work across the shared site — the entrance road, the internal compound, and the school, madrasa and production ' +
            'areas — runs as recurring duties with completion evidence and management verification rather than as informal reminders.',
        },
      ],
    },

    {
      id: 'marketing',
      title: 'Marketing and digital operations',
      summary: 'Shared content and publishing support.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Marketing operates as a shared, cross-entity support function: content and poster creation, monitoring the institutional social ' +
            'accounts, preparing brand content, and publishing scheduled posts. Content moves through an idea, draft, review, approved, scheduled ' +
            'and published cycle before it goes out.',
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Approved content flows to the marketing calendar for scheduling. Nothing publishes to a brand account automatically as a side effect ' +
            'of an operational task being completed.',
        },
      ],
    },

    {
      id: 'entity-manuals',
      title: 'Entity operating systems',
      summary: 'Where each brand\'s own manual lives.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Each entity has its own Operating System covering the work specific to it. This group manual covers what is shared; the entity ' +
            'manuals cover what is not.',
        },
        { kind: 'systemLink', href: '/operating-system/rhythms-college', label: 'Rhythms College Operating System' },
        { kind: 'systemLink', href: '/operating-system/ar-rayyan', label: 'Ar-Rayyan Playhouse & Daycare Operating System' },
        { kind: 'systemLink', href: '/operating-system/iceland-glitz-n-glim', label: 'Iceland / Glitz N\' Glim Operating System' },
        { kind: 'systemLink', href: '/operating-system/nairobi-piano-technicians', label: 'Nairobi Piano Technicians Operating System' },
        { kind: 'systemLink', href: '/operating-system/darul-swafa', label: 'Darul Swafa Operating System' },
        { kind: 'systemLink', href: '/operating-system/nuura-nest', label: 'Nuura Nest Operating System' },
      ],
    },
  ],
}
