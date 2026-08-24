import type { ManualDocument } from '../model'

/**
 * AR-RAYYAN PLAYHOUSE & DAYCARE (§25).
 *
 * Built from the current Rayyan module, employee routine records covering
 * teaching, daycare, playgroup, meals and hygiene, and academic-management
 * records covering supervision, quality assurance and cover.
 */
export const arRayyanManual: ManualDocument = {
  ref: 'ar-rayyan',
  title: 'Ar-Rayyan Playhouse & Daycare Operating System',
  entity: 'Ar-Rayyan Playhouse & Daycare',
  intro:
    'Ar-Rayyan is a playhouse, daycare and early-years school on the shared One Core Group campus. This manual describes the working day from ' +
    'opening and safeguarding through learner reception, teaching, care routines, meals, release and transport, and the academic management that ' +
    'supervises it. Young children are the operating constraint throughout: every routine here exists because a child cannot be left unaccounted for.',

  chapters: [
    {
      id: 'opening-safeguarding',
      title: 'Opening and safeguarding',
      summary: 'Preparing the premises before any child arrives.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Have the premises safe, clean, staffed and ready before the first learner is received.' },
            { label: 'Normal flow', value: 'Early arrival → school preparation → classroom preparation → confirm staffing → open to receive learners.' },
            { label: 'Responsible', value: 'Teaching and care staff prepare; academic management confirms readiness and staffing.' },
            { label: 'Records', value: 'A recurring Duty occurrence with completion note and evidence where required.' },
            { label: 'Escalation', value: 'A hazard, a staffing gap or an unsafe area is escalated before children are received, not after.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Staff arrive early enough to prepare rather than to start.',
            'Classrooms, play areas and outdoor areas are checked and made safe.',
            'Toilets and handwashing facilities are clean and supplied.',
            'Learning and play materials are set out for the day.',
            'Staffing for every group is confirmed before reception opens.',
          ],
        },
      ],
    },

    {
      id: 'learner-reception',
      title: 'Learner reception',
      summary: 'Receiving children and recording who is present.',
      blocks: [
        {
          kind: 'flow',
          title: 'Morning reception',
          steps: [
            'Receive the learner from parent, guardian or transport',
            'Record attendance',
            'Observe health and readiness',
            'Note anything the parent reports',
            'Settle the learner into their group',
          ],
        },
        {
          kind: 'list',
          items: [
            'Attendance is taken at reception, not reconstructed later in the morning.',
            'Health and readiness observations at the point of reception are recorded — a child who arrived unwell must be traceable to that observation.',
            'Anything a parent reports at handover (medication, a change in collection arrangements, a concern) is recorded and passed on.',
          ],
        },
      ],
    },

    {
      id: 'classroom-delivery',
      title: 'Classroom and curriculum delivery',
      summary: 'Teaching to the timetable and the curriculum.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Class preparation before the session.',
            'Teaching according to the timetable and the curriculum.',
            'Encouraging and recording learner participation.',
            'Classwork set, done and reviewed.',
            'Age-appropriate discipline and behaviour support.',
            'Break supervision — the playground is supervised, not merely available.',
            'Toilet routines supervised appropriately for age.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Records', value: 'Attendance, classwork, daily teaching record and any incident record.' },
            { label: 'Management control', value: 'Academic management checks teaching and learning across classes, not only in their own.' },
          ],
        },
      ],
    },

    {
      id: 'daycare-playgroup',
      title: 'Daycare and playgroup',
      summary: 'Care routines for the youngest children.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Daycare supervision throughout the day.',
            'Playgroup activities appropriate to age.',
            'Potty training, supported consistently.',
            'Changing nappies as needed, with hygiene maintained.',
            'Cleaning and changing bedsheets.',
            'Rest and nap supervision.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Care routines are as much a part of delivery as teaching is, and are supervised and recorded on the same basis. They are not ' +
            '"what happens between lessons".',
        },
      ],
    },

    {
      id: 'meals-hygiene',
      title: 'Meals and hygiene',
      summary: 'Feeding and keeping children clean and safe.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Learner meals, tea and lunch served at their scheduled times.',
            'Child hygiene supported before and after meals.',
            'Dietary requirements and allergies observed as recorded for the child.',
            'Classroom and facility cleanliness maintained through the day, not only at closing.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Meals are prepared by the shared kitchen function, which serves the school alongside other campus users. The school confirms numbers ' +
            'and timing; the kitchen prepares and serves.',
        },
      ],
    },

    {
      id: 'release-transport',
      title: 'Learner release and transport',
      summary: 'Handing a child back to the right adult.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Ensure every child leaves with an authorised adult, and that the school knows who has left and with whom.' },
            { label: 'Normal flow', value: 'Collection time → verify the collecting adult is authorised → record the release → hand over any message for the parent.' },
            { label: 'Responsible', value: 'Class and care staff release; administration holds the authorised-collector record.' },
            { label: 'Records', value: 'Release record; transport manifest where the child travels by van.' },
            { label: 'Escalation', value: 'An unknown or unauthorised collector, or an uncollected child, is escalated to management immediately and the parent contacted.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Pickup and van support is staffed and supervised.',
            'A change to collection arrangements is confirmed with the parent, not accepted from the collector alone.',
          ],
        },
      ],
    },

    {
      id: 'academic-quality',
      title: 'Academic quality and supervision',
      summary: 'How teaching is checked and supported.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Academic supervision across classes.',
            'Quality assurance of teaching and learning.',
            'Checking teaching and learning in other classes, not only one\'s own.',
            'Teacher support and development.',
            'Acting principal responsibilities when delegated.',
            'Academic planning.',
            'Benchmarking against comparable institutions.',
            'Policy and document development.',
            'Teacher training.',
            'Academic meetings.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Supervision produces a record. An observation that is not written down cannot be followed up, and cannot show improvement over time.',
        },
        { kind: 'dynamic', source: 'people', title: 'People assigned to Ar-Rayyan' },
      ],
    },

    {
      id: 'teacher-cover',
      title: 'Teacher management and cover',
      summary: 'Keeping every group staffed.',
      blocks: [
        {
          kind: 'flow',
          title: 'Emergency cover',
          steps: [
            'Absence identified',
            'Escalated to academic management',
            'Cover arranged from available staff',
            'Cover recorded against the session',
            'Records completed by whoever delivered the session',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'A group of young children cannot be left unstaffed for any period. Cover is arranged first and recorded second, but it is always ' +
            'recorded — including where kitchen or support staff assisted.',
        },
      ],
    },

    {
      id: 'assessments',
      title: 'Assessments and academic records',
      summary: 'Measuring and recording learner progress.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Examinations and assessment run on the academic calendar.',
            'Results are entered, verified and released.',
            'Academic documentation is maintained per learner.',
            'Progress is reported to parents at the scheduled points.',
          ],
        },
        { kind: 'systemLink', href: '/rayyan/reports', label: 'Reports' },
      ],
    },

    {
      id: 'daily-diaries',
      title: 'Daily diaries and records',
      summary: 'The daily record every member of staff keeps.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Both the Teacher Daily Diary and the Staff Daily Diary apply at Ar-Rayyan. Each is completed for the day, submitted, and countersigned ' +
            'by management. In the platform they are operational forms completed as recurring Duties, with an immutable review event standing in for ' +
            'the signature, date and stamp.',
        },
        {
          kind: 'list',
          items: [
            'Date, staff member and class or area.',
            'Time blocks through the working day.',
            'To Do — what was planned.',
            'Challenge — what got in the way.',
            'Mitigation / game plan — what was done about it.',
            'Admin comment — the reviewer\'s response.',
          ],
        },
        { kind: 'systemLink', href: '/my-work', label: 'My Work' },
        { kind: 'systemLink', href: '/management/duties', label: 'Duty Management' },
      ],
    },

    {
      id: 'resources',
      title: 'Learning resources and academic inventory',
      summary: 'What the school teaches with.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Learning-resource procurement raised through the normal procurement route.',
            'Academic inventory and resources tracked so shortages surface before a lesson, not during it.',
            'Educational trips planned, approved and run as events.',
            'First aid supplies maintained and accessible.',
          ],
        },
        { kind: 'systemLink', href: '/procurement', label: 'Procurement' },
      ],
    },

    {
      id: 'fees',
      title: 'Fees and finance',
      summary: 'Fee records and their reconciliation.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Fee handling follows the group\'s student payment controls: every payment has a recognised source record and an official receipt, the ' +
            'learner ledger is updated, income is categorised by entity, and the position is reconciled against the payment statement by group finance.',
        },
        { kind: 'systemLink', href: '/rayyan/fees', label: 'Fees' },
        { kind: 'knowledge', titles: ['Student Administration and Fee Records'] },
      ],
    },

    {
      id: 'parent-escalation',
      title: 'Parent communication and escalation',
      summary: 'When and how something goes up.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Routine communication happens at handover and through scheduled parent meetings.',
            'An injury, illness or safeguarding concern is escalated to management and the parent contacted the same day.',
            'A fee or continuation decision requires management authority and is recorded.',
            'A complaint is recorded, escalated and closed out with the parent.',
          ],
        },
      ],
    },

    {
      id: 'facilities',
      title: 'Facilities',
      summary: 'Shared-campus cleaning and maintenance.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Ar-Rayyan is covered by the shared campus facilities routine: daily cleaning of classrooms and toilets, compound sweeping, and a ' +
            'weekly cycle that includes a dedicated day for Ar-Rayyan departments. Completion carries a comment and is verified by administration.',
        },
      ],
    },

    {
      id: 'live-data',
      title: 'Current entity data',
      summary: 'Live structured records for Ar-Rayyan.',
      blocks: [
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'dynamic', source: 'authorities', title: 'Recorded authorities' },
        { kind: 'dynamic', source: 'forms', title: 'Operational forms in use' },
      ],
    },
  ],
}
