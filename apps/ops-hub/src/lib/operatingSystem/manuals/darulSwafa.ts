import type { ManualDocument } from '../model'

/**
 * DARUL SWAFA (§29).
 *
 * Built from the current Darul module (students, classes, hifz, fees,
 * admissions, parents, reports) and employee routine records describing the
 * madrasa daily administrative pattern. Deliberately does NOT invent academic
 * processes the code and source records do not support.
 */
export const darulSwafaManual: ManualDocument = {
  ref: 'darul-swafa',
  title: 'Darul Swafa Operating System',
  entity: 'Darul Swafa',
  intro:
    'Darul Swafa is a madrasa operating on the shared One Core Group campus, with day and boarding students. This manual describes the daily ' +
    'administrative pattern: opening the office, recording attendance for students and teaching staff, tracking food and boarding supplies, ' +
    'maintaining the daily analysis record, and closing securely. It reflects what the current system and current records support.',

  chapters: [
    {
      id: 'opening-admin',
      title: 'Opening and office administration',
      summary: 'Starting the madrasa day.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Open the office, make the day\'s records ready, and confirm the madrasa can run.' },
            { label: 'Normal flow', value: 'Open and tidy the office → open the daily analysis record → take attendance → confirm food and supply position → run the day.' },
            { label: 'Responsible', value: 'Madrasa administration, with teaching staff responsible for their own attendance and class records.' },
            { label: 'Records', value: 'Daily analysis record, attendance registers, supply notes.' },
            { label: 'Escalation', value: 'A staffing gap, a supply shortage affecting meals, or an unaccounted student is escalated the same morning.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Office opened and made presentable.',
            'The daily analysis record opened for the day.',
            'Any outstanding item from the previous day carried forward.',
          ],
        },
      ],
    },

    {
      id: 'attendance',
      title: 'Attendance',
      summary: 'Students and teaching staff.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Student attendance recorded for the day.',
            'Ustadha (teaching staff) attendance recorded.',
            'Absences noted, and followed up where a student is unexpectedly absent.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Both registers matter for different reasons: student attendance is a welfare and academic record, staff attendance is an operational ' +
            'and payroll record. They are taken separately and are not inferred from each other.',
        },
        { kind: 'systemLink', href: '/darul/students', label: 'Students' },
      ],
    },

    {
      id: 'teaching',
      title: 'Teaching and madrasa delivery',
      summary: 'Classes and memorisation progress.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Teaching runs to the madrasa timetable across its classes. Memorisation (hifz) progress is tracked per student, which is the primary ' +
            'academic record the madrasa maintains.',
        },
        {
          kind: 'list',
          items: [
            'Classes and class allocation per student.',
            'Hifz progress recorded per student.',
            'Class delivery recorded for the day.',
          ],
        },
        { kind: 'systemLink', href: '/darul/classes', label: 'Classes' },
        { kind: 'systemLink', href: '/darul/hifz', label: 'Hifz progress' },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Assessment and certification processes beyond hifz progress tracking are not yet formally recorded for Darul Swafa. Where the madrasa ' +
            'operates additional academic controls, they should be confirmed by management and recorded before being relied on here.',
        },
      ],
    },

    {
      id: 'teacher-records',
      title: 'Teacher and staff records',
      summary: 'The daily record staff keep.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The Teacher Daily Diary and the Staff Daily Diary apply at Darul Swafa. Each is completed for the day, submitted, and countersigned by ' +
            'management — represented in the platform as an operational form completed as a recurring Duty, with an immutable review event standing ' +
            'in for the signature, date and stamp.',
        },
        {
          kind: 'list',
          items: [
            'Date, staff member and class.',
            'Time blocks through the working day.',
            'To Do, Challenge, and Mitigation / game plan.',
            'Admin comment from the reviewer.',
          ],
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work' },
      ],
    },

    {
      id: 'student-records',
      title: 'Student records',
      summary: 'What is held per student.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Identity, guardian contact and admission details.',
            'Class allocation and whether the student is day or boarding.',
            'Attendance record.',
            'Hifz progress.',
            'Fee ledger and payment history.',
          ],
        },
        { kind: 'systemLink', href: '/darul/admissions', label: 'Admissions' },
        { kind: 'systemLink', href: '/darul/parents', label: 'Parents' },
      ],
    },

    {
      id: 'food-supplies',
      title: 'Food and boarding supplies',
      summary: 'The daily supply position.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The madrasa tracks its consumable and boarding supply position daily, because a shortfall discovered at meal time cannot be resolved ' +
            'at meal time.',
        },
        {
          kind: 'list',
          items: [
            'Bread usage for the day.',
            'Amount purchased.',
            'Payment confirmation for purchases.',
            'Food status — what is available.',
            'Sugar, tea and food requirements identified for the next purchase.',
            'Boarding-student supply requirements.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Records', value: 'Daily analysis record, purchase records and receipts.' },
            { label: 'Management control', value: 'Usage against purchase is visible day to day, so consumption that does not match the roll is questioned early.' },
            { label: 'Escalation', value: 'A shortfall that will affect a meal is escalated immediately, not recorded for the next review.' },
          ],
        },
      ],
    },

    {
      id: 'daily-analysis',
      title: 'The daily analysis record',
      summary: 'The madrasa\'s single daily operating record.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The daily analysis record is where the day is summarised: attendance for students and staff, the food and supply position, purchases ' +
            'made and confirmed, and anything outstanding. It is opened at the start of the day and closed at the end of it.',
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Its value is that it is written during the day, not reconstructed afterwards. A record completed from memory at closing loses exactly ' +
            'the detail it exists to capture.',
        },
      ],
    },

    {
      id: 'finance',
      title: 'Finance and purchases',
      summary: 'Fees in, purchases out.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Fee handling follows the group\'s student payment controls: a recognised source record and official receipt for every payment, the ' +
            'student ledger updated, income categorised by entity, and the position reconciled by group finance. Daily purchases are receipted and ' +
            'allocated, with petty cash reconciled on its float cycle.',
        },
        { kind: 'systemLink', href: '/darul/fees', label: 'Fees' },
        { kind: 'systemLink', href: '/petty-cash', label: 'Petty Cash' },
        { kind: 'knowledge', titles: ['Student Administration and Fee Records', 'Petty Cash Float Cycle and Supporting Evidence'] },
      ],
    },

    {
      id: 'facilities',
      title: 'Facilities',
      summary: 'Shared-campus support.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Darul Swafa is served by the shared campus facilities routine — daily cleaning, compound sweeping and the weekly maintenance cycle — ' +
            'and by the shared kitchen function for meals. Both run as recurring Duties with completion evidence and verification.',
        },
      ],
    },

    {
      id: 'management-review',
      title: 'Management review',
      summary: 'What management checks.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Attendance records for students and staff.',
            'Submitted daily diaries, countersigned or reopened.',
            'The daily analysis record and its supply position.',
            'Outstanding fee balances.',
            'Anything escalated during the day and whether it was closed.',
          ],
        },
        { kind: 'systemLink', href: '/darul/reports', label: 'Reports' },
      ],
    },

    {
      id: 'events',
      title: 'Events and calendar',
      summary: 'Planned activity beyond the timetable.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Madrasa events follow the group event pattern: approved and planned, entered on the calendar, tasks allocated to responsible people, ' +
            'logistics and communications arranged, attendance recorded, and closed out with a completion report.',
        },
        { kind: 'systemLink', href: '/calendar', label: 'Calendar' },
      ],
    },

    {
      id: 'closing',
      title: 'Closing and security',
      summary: 'Ending the day.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Complete and close the daily analysis record.',
            'Confirm the day\'s attendance and diary records are submitted.',
            'Confirm boarding students are accounted for.',
            'Secure the office and its records.',
            'Report any incident, breakage or shortfall before leaving.',
          ],
        },
      ],
    },

    {
      id: 'live-data',
      title: 'Current entity data',
      summary: 'Live structured records for Darul Swafa.',
      blocks: [
        { kind: 'dynamic', source: 'people', title: 'People assigned to Darul Swafa' },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'dynamic', source: 'forms', title: 'Operational forms in use' },
      ],
    },
  ],
}
