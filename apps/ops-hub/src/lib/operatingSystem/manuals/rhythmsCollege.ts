import type { ManualDocument } from '../model'

/**
 * RHYTHMS COLLEGE (§§14–24, §53).
 *
 * The richest source material of any entity: a detailed legacy operating manual
 * covering opening controls, front office, admissions, fees, academic delivery,
 * examinations, management verification, facilities and events — plus current
 * management-provided records (the Teacher Daily Diary and the facilities
 * routine).
 *
 * The legacy document dates from an earlier operating period. Its PROCESS
 * ARCHITECTURE is excellent and is preserved. Its SPECIFICS — fee amounts,
 * examination-body dates, statutory processes, penalties — are historical and
 * are NOT asserted as current 2026 rules. Where such detail matters it is
 * collected in the "Historical operating reference" chapter, marked as
 * requiring current management confirmation, rather than silently relabelled.
 */
export const rhythmsCollegeManual: ManualDocument = {
  ref: 'rhythms-college',
  title: 'Rhythms College Operating System',
  entity: 'Rhythms College',
  intro:
    'Rhythms College is a music and skills college operating from the shared One Core Group campus. This manual describes how the college runs ' +
    'a working day: how the premises are opened and checked, how the front office controls administration, how an inquiry becomes an enrolled ' +
    'student, how fees are received and reconciled, how teaching and assessment are recorded, how management verifies all of it, and how the ' +
    'day is closed. It is the most detailed entity manual because the source material supports it.',

  chapters: [
    {
      id: 'scope',
      title: 'Scope and provenance',
      summary: 'What this manual is built from, and what still needs confirming.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'This manual combines three sources: the current Ops Hub operating architecture, current management-provided operational records ' +
            '(including the Teacher Daily Diary and the facilities routine), and a detailed legacy college operating manual from an earlier period.',
        },
        {
          kind: 'callout',
          tone: 'legacy',
          title: 'Legacy material is process, not policy',
          text:
            'The legacy manual is used for its process architecture — admission controls, manager clearance, examination administration, receipting ' +
            'discipline, daily planning, staff logs, class registers, opening and closing controls, periodic inspection, facility routines, events ' +
            'and management verification. Its historical specifics are not reproduced as current rules. See "Historical operating reference".',
        },
      ],
    },

    {
      id: 'opening',
      title: 'Opening and facility preparation',
      summary: 'The inspection that has to pass before the college can receive anyone.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Confirm the premises are safe, clean, secure and ready to receive students, staff and visitors before the day starts.' },
            { label: 'Normal flow', value: 'Open → walk the compound and buildings against the opening check → resolve what can be resolved → report breakages and abnormalities → confirm readiness.' },
            { label: 'Responsible', value: 'Facilities/grounds staff perform the routine; front office and academic management confirm readiness.' },
            { label: 'Records', value: 'A recurring Duty occurrence with a completion note, checklist result and evidence where required.' },
            { label: 'Management control', value: 'Administration verifies completion; unresolved items are escalated rather than carried silently.' },
            { label: 'Escalation', value: 'Breakages, safety hazards and anything suspicious are reported immediately, not held until the end of the day.' },
            { label: 'In the system', value: 'Duty Management configures it; the person completes it in My Work.' },
          ],
        },
        {
          kind: 'paragraph',
          text: 'The opening inspection covers, in the order the premises are walked:',
        },
        {
          kind: 'list',
          items: [
            'Gate and opening readiness; the entrance lane clean and clear.',
            'Anything suspicious or unsafe on the approach or in the compound.',
            'Directional and institutional signage visible and legible.',
            'General compound condition and sweeping.',
            'Handwashing water available; soap present; handwashing sink clean and working.',
            'Toilets clean, supplied with tissue, and functioning.',
            'Emergency wash water available.',
            'Water storage secure and not contaminated.',
            'Workshop condition and safety.',
            'Offices and classrooms ready for use.',
            'Computer lab ready and secure.',
            'Music practice areas ready; pianos and instruments in order and undamaged.',
            'Verandah, kitchen, staffroom and manager\'s office presentable.',
            'Dustbins emptied and replaced.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Instrument condition is part of the opening check, not a separate exercise. A damaged piano discovered at 08:00 can be worked around; ' +
            'the same damage discovered when a class starts cannot.',
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work', description: 'Where the opening duty is completed and evidence attached.' },
      ],
    },

    {
      id: 'front-office',
      title: 'Front office control',
      summary: 'The administrative control point for the college day.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The front office is the college\'s administrative control point. It holds the day\'s plan, receives inquiries and visitors, records ' +
            'activity, tracks whether planned work happened, and escalates anything requiring authority it does not hold.',
        },
        {
          kind: 'flow',
          title: 'Front office day',
          steps: [
            'Review the day\'s plan in My Work at the start of the day',
            'Carry forward unresolved work from the previous day',
            'Receive inquiries, visitors and payments through the approved process',
            'Record important activity as it happens',
            'Supervise delegated routines to completion',
            'Confirm at the end of the day what happened and what did not',
            'Record the reason and the mitigation for anything that did not',
            'Secure rooms, windows and the workshop at closing',
          ],
        },
        {
          kind: 'list',
          items: [
            'The office is not run by assumption. If a routine\'s completion is unknown, it is checked, not presumed.',
            'Where a decision needs authority the office does not hold — a fee concession, a continuation decision, an exception — it is escalated to management rather than improvised.',
            'Institutional readiness is monitored continuously, not only at opening: consumables, signage, cleanliness, and preparation for anything scheduled.',
            'Preparation for scheduled events begins before the event, against the calendar entry.',
            'Inquiries and visitors are handled professionally and recorded; an unrecorded inquiry cannot be followed up.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Planned versus actual',
          text:
            'The discipline that makes the day auditable is recording not only what was planned, but whether it happened, and if not, why, and what ' +
            'was done instead. That is the same structure the Teacher Daily Diary uses: To Do, Challenge, Mitigation.',
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work' },
        { kind: 'systemLink', href: '/calendar', label: 'Calendar' },
      ],
    },

    {
      id: 'inquiry-admission',
      title: 'Inquiry and admission',
      summary: 'From a first question at the gate to a student in a class.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Convert a genuine inquiry into a correctly recorded, correctly paid, correctly placed student.' },
            { label: 'Responsible', value: 'Front office receives and registers; academic management confirms placement; finance confirms payment.' },
            { label: 'Records', value: 'Inquiry record, admission record with admission number, official receipt, fee ledger, class register and attendance record.' },
            { label: 'Management control', value: 'Placement and any fee variation are confirmed by authorised management before teaching begins.' },
            { label: 'Escalation', value: 'A requested concession, an unusual payment arrangement or a disputed prerequisite goes to management, not to the desk.' },
          ],
        },
        {
          kind: 'flow',
          title: 'Admission flow',
          steps: [
            'Potential inquiry received',
            'Welcome and establish what the person actually needs',
            'Explain the programme or course accurately',
            'Explain current approved fees and requirements',
            'Record the inquiry',
            'Registration decision',
            'Collect correct student identity details',
            'Capture photograph and documentation where required',
            'Create the student record and admission number',
            'Receive payment through the approved payment process',
            'Issue the official receipt',
            'Create or update the fee ledger',
            'Create the attendance and class record',
            'Allocate class, course and teacher',
            'Provide the required admission and course information',
            'Hand the student over into academic delivery',
          ],
        },
        {
          kind: 'list',
          items: [
            'The student\'s name is captured exactly as it appears on their identity document — a misspelled name propagates into the register, the ledger and eventually a certificate.',
            'A registration number is issued from the system, not invented at the desk.',
            'A photograph and the admission form are collected where the programme requires them.',
            'Course prerequisites and requirements are explained before payment, not after.',
            'The handover to the teacher is explicit. A student who has paid but has not been introduced to a class has not been admitted.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Fees quoted must be current',
          text:
            'Fees, replacement charges and examination costs are quoted from current approved information only. Historical amounts from earlier ' +
            'operating periods must not be quoted to a prospective student.',
        },
        { kind: 'systemLink', href: '/rhythms', label: 'Rhythms admin', description: 'Students, classes, admissions and fees.' },
        { kind: 'knowledge', titles: ['Student Administration and Fee Records'] },
      ],
    },

    {
      id: 'student-records',
      title: 'Student records',
      summary: 'What is held about a student, and who may see it.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Identity and contact details, and guardian or next-of-kin contact where applicable.',
            'Admission number, admission date, programme and class allocation.',
            'Fee ledger with every charge, payment, receipt reference and running balance.',
            'Attendance record.',
            'Assessment and examination results.',
            'Certificates and transcripts issued.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Student records are entity-scoped. Access follows role and record horizon: a teacher sees the students they teach, administration ' +
            'sees the college\'s students, and group management sees across entities where granted.',
        },
        { kind: 'systemLink', href: '/rhythms/students', label: 'Students' },
      ],
    },

    {
      id: 'fees-receipts',
      title: 'Student payments, receipts and fee control',
      summary: 'Every shilling has a source record.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Ensure every payment is recognised, receipted, categorised, posted to the right student and reconcilable against the payment statement.' },
            { label: 'Normal flow', value: 'Payment received through the approved process → official receipt issued → student ledger updated → payment categorised → reconciled against statement → balance visible.' },
            { label: 'Responsible', value: 'Front office receives and receipts; group finance reconciles and categorises; management authorises exceptions.' },
            { label: 'Records', value: 'Official receipt, student fee ledger, banking and revenue record, payment statement.' },
            { label: 'Management control', value: 'Balances are reviewed; continuation or suspension decisions require authority and are recorded.' },
            { label: 'Escalation', value: 'Unmatched receipts and unmatched statement lines are followed up until resolved, not written off at the desk.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Every payment has a recognised source record. A payment with no receipt is an incident, not a transaction.',
            'Payments are categorised correctly by entity and income class so the reconciliation is meaningful.',
            'Promised payment dates are recorded and followed up.',
            'Teaching or service on unauthorised credit is not permitted; a credit arrangement requires management authority and is recorded.',
            'The audit trail from receipt to ledger to statement stays intact.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Books become evidence',
          text:
            'Historical receipt books and fee spreadsheets remain valid historical source evidence. The platform is progressively becoming the live ' +
            'record. Where both exist during transition, both are maintained, and the reconciliation is what proves they agree.',
        },
        { kind: 'systemLink', href: '/rhythms/fees', label: 'Fees' },
        { kind: 'systemLink', href: '/finance', label: 'Finance' },
      ],
    },

    {
      id: 'academic-delivery',
      title: 'Academic delivery',
      summary: 'Timetable, attendance, lesson records and progress.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Teaching runs against a published timetable. Delivery is evidenced by records made at the time, not reconstructed later.',
        },
        {
          kind: 'list',
          items: [
            'Timetable — what is taught, when, by whom, in which room.',
            'Student attendance — taken per class session.',
            'Teacher attendance — recorded and checked.',
            'Lesson plan — prepared before the lesson.',
            'Record of work — what was actually covered.',
            'Daily class occurrence record — what happened in the session.',
            'Homework and classwork — set, collected and marked.',
            'Learner progress — tracked against the syllabus.',
            'Continuous assessment cycle, then final examinations.',
            'Syllabus completion — monitored so gaps surface before the examination, not after.',
            'Teaching resources and instruments — cared for and returned in order.',
          ],
        },
        {
          kind: 'flow',
          title: 'Absent teacher',
          steps: [
            'Absence identified at or before the session',
            'Escalated to academic management',
            'Cover arranged from available staff',
            'Cover recorded against the session',
            'Record of work updated by whoever delivered it',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Staff also carry preparation of daily lessons, class assignments and, in practice, multiple classes or packages. Workload is visible ' +
            'through the timetable and My Work rather than negotiated informally.',
        },
      ],
    },

    {
      id: 'daily-diary',
      title: 'Teacher Daily Diary',
      summary: 'The current daily teaching record and its management countersignature.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The Teacher Daily Diary is the college\'s current daily teaching record. In the platform it is an operational form completed as a ' +
            'recurring Duty and countersigned by management — not a Knowledge document, and not a loose sheet.',
        },
        {
          kind: 'list',
          items: [
            'Date, teacher and class.',
            'Time blocks through the working day.',
            'To Do — what was planned for each block.',
            'Challenge — what got in the way.',
            'Mitigation / game plan — what was done about it.',
            'Admin comment — the reviewer\'s response.',
            'Signature, date and stamp — represented digitally by the countersignature and its immutable review event.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Record what was actually delivered each day, what obstructed it, and how it was handled.' },
            { label: 'Normal flow', value: 'Teacher completes the diary for the day → submits → pending review → academic management reads and countersigns or reopens.' },
            { label: 'Records', value: 'The form submission, the duty occurrence, and the immutable review event carrying who signed and when.' },
            { label: 'Management control', value: 'Unsubmitted diaries are visible as outstanding duties; reopened diaries return with a written reason.' },
            { label: 'In the system', value: 'Configured as a duty requiring its form; completed in My Work; countersigned in Duty Management.' },
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          text:
            'A duty that requires a form cannot be completed by a generic "done" tick. The system refuses the completion until the form is submitted, ' +
            'and says so on the duty card.',
        },
        { kind: 'systemLink', href: '/management/duties', label: 'Duty Management' },
      ],
    },

    {
      id: 'examinations',
      title: 'Examinations and certificates',
      summary: 'From assessment calendar to certificate collection.',
      blocks: [
        {
          kind: 'flow',
          title: 'Examination cycle',
          steps: [
            'Assessment and examination calendar published',
            'Teacher prepares and coordinates the examination',
            'Administration confirms candidate eligibility',
            'Fee and academic clearance where applicable',
            'Authorised management clearance where required',
            'Timetable published to candidates',
            'Examination sitting',
            'Marking',
            'Result entry',
            'Review and verification',
            'Certificate or transcript preparation',
            'Controlled collection against clearance',
          ],
        },
        {
          kind: 'list',
          items: [
            'Continuous assessment runs through the term; internal finals and external examinations follow the published calendar.',
            'Candidate eligibility is confirmed before entry, not discovered at the desk on the day.',
            'Registration for external examinations is completed within the examining body\'s deadlines; late registration is an escalation, not a routine.',
            'Marks are entered, then verified before results are released.',
            'Certificates and transcripts are issued against clearance and their issue is recorded.',
          ],
        },
        {
          kind: 'callout',
          tone: 'legacy',
          title: 'Examination bodies and dates',
          text:
            'Specific external examination bodies, entry fees and registration deadlines from earlier operating periods are historical. Current ' +
            'deadlines and costs must be confirmed against the examining body for the current year before anything is quoted or planned.',
        },
        { kind: 'systemLink', href: '/rhythms/reports', label: 'Reports' },
      ],
    },

    {
      id: 'academic-management',
      title: 'Academic and deputy management control',
      summary: 'What management inspects, verifies and chairs.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Academic management is a verification function as much as a leadership one. The controls below are performed on a routine cycle, ' +
            'and each produces a record.',
        },
        {
          kind: 'list',
          items: [
            'Inspect classes and the compound.',
            'Check student attendance records.',
            'Check lecturer daily occurrence and log records.',
            'Chair staff meetings and daily or weekly briefings.',
            'Verify auditions and new-student placement processes.',
            'Ensure external examination registration is completed in time.',
            'Monitor outstanding student balances with administration and finance.',
            'Enforce professional front-office standards.',
            'Induct new staff.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Induction of a new teacher explicitly covers the records they will be held to:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Attendance — theirs and their students\'.',
            'Lesson plans.',
            'Record of work.',
            'Schemes of work.',
            'The Daily Diary.',
            'Continuous assessment.',
            'Student registers.',
            'The academic programme rules they teach within.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Management control', value: 'Inspection findings are recorded and followed up. An inspection that produces no record produces no accountability.' },
            { label: 'Escalation', value: 'Repeated failures in records or delivery escalate to college management and, where required, to group management.' },
          ],
        },
        { kind: 'dynamic', source: 'people', title: 'People and responsibility map' },
      ],
    },

    {
      id: 'facilities',
      title: 'Facilities and grounds routines',
      summary: 'The shared-site cleaning and maintenance cycle.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Facilities and grounds work covers the shared campus, not Rhythms alone. Current coverage spans Rhythms, Ar-Rayyan, the production ' +
            'area, the road entry and the internal road and compound.',
        },
        {
          kind: 'list',
          items: [
            'Daily — morning cleaning, compound sweeping, classroom and toilet cleaning, showroom sinks and urinals, roads and boundaries.',
            'Monday — roadside, fence and ground maintenance.',
            'Tuesday — the production/geyser area.',
            'Wednesday — Rhythms departments.',
            'Thursday — Ar-Rayyan departments.',
            'Friday — waste.',
            'Saturday — deeper general cleaning.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Records', value: 'Each is a recurring Duty occurrence carrying a completion comment and, where required, evidence.' },
            { label: 'Management control', value: 'Administration and management verify completion; the weekly pattern makes a missed day visible rather than absorbed.' },
            { label: 'In the system', value: 'Configured in Duty Management, completed in My Work — not a handwritten reminder list.' },
          ],
        },
      ],
    },

    {
      id: 'events',
      title: 'Events and institutional programmes',
      summary: 'How an approved activity is planned, run and closed out.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The college runs structured institutional programmes alongside teaching. The operating principle is the same for all of them, ' +
            'whatever the activity.',
        },
        {
          kind: 'flow',
          title: 'Event lifecycle',
          steps: [
            'Event approved and planned',
            'Calendar entry created',
            'Responsible person and tasks allocated',
            'Venue and logistics arranged',
            'Communications issued',
            'Participant and attendance record kept',
            'Materials and financial control applied',
            'Activity runs',
            'Completion report and evidence recorded',
          ],
        },
        {
          kind: 'list',
          items: [
            'Outdoor games and sports activities.',
            'Prayer day.',
            'Parents meetings.',
            'Counselling programmes.',
            'Community and children\'s-home programmes.',
            'Talent and welfare days.',
            'End-of-year activities.',
            'Staff and student trips.',
          ],
        },
        {
          kind: 'callout',
          tone: 'legacy',
          text:
            'Historical frequencies for these activities are not treated as current mandatory rules. Which programmes run, and how often, is a ' +
            'current management decision recorded in the calendar.',
        },
        { kind: 'systemLink', href: '/calendar', label: 'Calendar' },
      ],
    },

    {
      id: 'closing',
      title: 'Closing and security',
      summary: 'How the day ends.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Confirm the day\'s planned work against what actually happened, and record the reason for anything outstanding.',
            'Ensure teaching records for the day are submitted.',
            'Secure classrooms, offices, the computer lab and the workshop.',
            'Close and secure windows.',
            'Secure instruments and equipment.',
            'Confirm the compound is clear and bins emptied.',
            'Report any breakage, loss or abnormality before leaving.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Closing is a control, not a courtesy. An unsecured workshop or an unreported breakage discovered the following morning has already ' +
            'cost the college a night of uncertainty about what happened.',
        },
      ],
    },

    {
      id: 'historical-reference',
      title: 'Historical operating reference — requires current confirmation',
      summary: 'Legacy specifics deliberately not asserted as current policy.',
      blocks: [
        {
          kind: 'callout',
          tone: 'legacy',
          title: 'Read this before quoting anything from the legacy manual',
          text:
            'The legacy college manual contains detailed operational specifics from an earlier period. The process discipline it describes is ' +
            'preserved throughout this manual. The specifics below are NOT current policy and must be confirmed against current approved ' +
            'information before being used, quoted to a student, or planned against.',
        },
        {
          kind: 'list',
          items: [
            'Fee amounts, course prices and payment plans quoted in the legacy manual.',
            'Identity-card and document replacement charges.',
            'External examination entry fees and registration deadlines.',
            'Examination body registration processes as they stood at the time.',
            'Statutory deduction and remittance processes as they stood at the time.',
            'Licence and permit renewal dates.',
            'Staff conduct restrictions, including any relating to social media use.',
            'Disciplinary penalties and fines.',
            'Stated course durations, intake frequencies and class sizes.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Where any of the above is needed operationally, management should confirm the current position and record it as approved Knowledge, ' +
            'at which point this manual can reference that document instead of this warning.',
        },
        { kind: 'systemLink', href: '/knowledge', label: 'Company Knowledge' },
      ],
    },

    {
      id: 'live-data',
      title: 'Current college data',
      summary: 'Live structured records for this entity.',
      blocks: [
        { kind: 'dynamic', source: 'people', title: 'People assigned to Rhythms College' },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'dynamic', source: 'authorities', title: 'Recorded authorities' },
        { kind: 'dynamic', source: 'forms', title: 'Operational forms in use' },
      ],
    },
  ],
}
