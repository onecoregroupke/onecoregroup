import type { ManualDocument } from '../model'

/**
 * NAIROBI PIANO TECHNICIANS (§28).
 *
 * Built from the existing NPT modules (intake, repair, movements, workshop,
 * appointments, comms) plus employee cross-entity administration records
 * describing the NPT Daily Book, Piano Moving Book, Instrument Repair Receiving
 * Form and Order Book.
 */
export const nptManual: ManualDocument = {
  ref: 'nairobi-piano-technicians',
  title: 'Nairobi Piano Technicians Operating System',
  entity: 'Nairobi Piano Technicians',
  intro:
    'Nairobi Piano Technicians tunes, repairs, moves and services pianos and related instruments. This manual describes how an inquiry becomes a ' +
    'booked job, how an instrument is received and identified, how workshop and on-site work is recorded, how the instrument is returned, and how ' +
    'the job is invoiced, followed up and reported. The instrument is the thread: at every point the business should be able to say where a ' +
    'customer\'s piano is and what has been done to it.',

  chapters: [
    {
      id: 'inquiry',
      title: 'Inquiry and customer contact',
      summary: 'First contact through to a booked job.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Capture every genuine inquiry, understand the instrument and the need, and convert it into a scheduled job.' },
            { label: 'Normal flow', value: 'Inquiry received → customer and instrument identified → need established → quotation or estimate where required → appointment booked.' },
            { label: 'Records', value: 'Customer record, instrument record, call log entry, appointment.' },
            { label: 'Escalation', value: 'A quotation outside standard rates, or a job requiring specialist parts, goes to management before it is promised.' },
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Calls and messages are logged. A call log is not an archive — it is the input to customer follow-up, and an inquiry that was never ' +
            'recorded cannot be chased.',
        },
        { kind: 'systemLink', href: '/npt', label: 'NPT Service' },
      ],
    },

    {
      id: 'intake',
      title: 'Instrument receipt and identification',
      summary: 'Taking an instrument in.',
      blocks: [
        {
          kind: 'flow',
          title: 'Receiving',
          steps: [
            'Instrument arrives or is collected',
            'Customer and instrument identified',
            'Condition recorded on receipt',
            'Instrument Repair Receiving record raised',
            'Instrument assigned to workshop or technician',
          ],
        },
        {
          kind: 'list',
          items: [
            'The instrument is identified by make, model and serial or an assigned reference — not by the customer\'s surname alone.',
            'Condition on receipt is recorded, including existing damage, so a pre-existing fault is not later attributed to the workshop.',
            'The customer receives an acknowledgement of what was received.',
          ],
        },
      ],
    },

    {
      id: 'workshop',
      title: 'Workshop and technician activity',
      summary: 'The daily record of work done.',
      blocks: [
        {
          kind: 'list',
          items: [
            'A daily workshop record captures what each technician worked on.',
            'Staff record the previous day\'s activities as part of the administrative routine.',
            'Work performed, parts used and time spent are recorded against the job, not against the day in general.',
            'Instrument status is kept current so the front office can answer "where is it?" without walking to the workshop.',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Records', value: 'Daily workshop record, job record, parts consumption, instrument status.' },
            { label: 'Management control', value: 'Open jobs are reviewed against their age; an instrument sitting untouched surfaces as an exception.' },
          ],
        },
        { kind: 'systemLink', href: '/npt/workspace', label: 'NPT workspace' },
      ],
    },

    {
      id: 'movements',
      title: 'Instrument movement records',
      summary: 'Every time an instrument changes location.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Piano movement is a distinct, recorded operation — collection, delivery, internal transfer and return. Each movement records the ' +
            'instrument, the date, the origin, the destination and who moved it.',
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Movement records exist so custody is never ambiguous. A high-value instrument in transit with no movement record is an instrument ' +
            'nobody can currently account for.',
        },
      ],
    },

    {
      id: 'service-repair',
      title: 'Service, repair and completion',
      summary: 'Doing the work and closing the job.',
      blocks: [
        {
          kind: 'flow',
          title: 'Job lifecycle',
          steps: [
            'Job scheduled',
            'Work performed (workshop or on site)',
            'Parts and materials recorded',
            'Work checked',
            'Job marked complete',
            'Customer notified',
            'Collection or delivery',
            'Invoice and payment',
            'Follow-up',
          ],
        },
        {
          kind: 'list',
          items: [
            'On-site tuning and servicing runs against the technician\'s appointments, which appear in their My Work for the day.',
            'A job is complete when the work is done and recorded, not when the technician leaves the site.',
            'Collection or delivery is recorded as a movement.',
          ],
        },
      ],
    },

    {
      id: 'parts-inventory',
      title: 'Parts and workshop inventory',
      summary: 'Materials, supply requests and the stock card.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Supply requests are collected from staff and recorded in the order record.',
            'Purchases follow the normal procurement route: requirement, approval, supplier, Goods Received Note, stock.',
            'Parts issued to a job are recorded against that job.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'One stock card',
          text:
            'The workshop stock position is the derived inventory stock card — opening, in, out and closing replayed from the movement ledger. ' +
            'A second, hand-maintained workshop ledger is not maintained alongside it; where a paper card is still filled in during transition it ' +
            'is a source document, not a competing balance.',
        },
        { kind: 'systemLink', href: '/inventory/stock-cards', label: 'Stock cards' },
        { kind: 'systemLink', href: '/procurement', label: 'Procurement' },
      ],
    },

    {
      id: 'invoicing',
      title: 'Invoicing, payment and receivables',
      summary: 'Getting paid, and knowing who has not paid.',
      blocks: [
        {
          kind: 'list',
          items: [
            'A completed job is invoiced against the customer and the work recorded.',
            'Payments are receipted and applied to the invoice.',
            'Outstanding balances are derived from invoices and payments.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Debtors are derived, not typed',
          text:
            'The debtors position is accounts receivable calculated from invoice and payment records. It is not maintained as a parallel ' +
            'spreadsheet — a hand-kept debtors list disagrees with the invoices the moment a payment is posted and nobody updates it.',
        },
        { kind: 'systemLink', href: '/finance', label: 'Finance' },
      ],
    },

    {
      id: 'follow-up',
      title: 'Customer follow-up and service reminders',
      summary: 'Bringing customers back.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Pianos need periodic tuning, so service follow-up is a recurring commercial routine rather than an occasional courtesy. Follow-up is ' +
            'driven from customer activity — the last service, the instrument, and the agreed interval — and produces a contact task or reminder.',
        },
        {
          kind: 'list',
          items: [
            'Call and contact activity is logged against the customer.',
            'Due follow-ups surface as work, not as a memory.',
            'A declined or deferred follow-up is recorded with the reason so it is not chased again next week.',
          ],
        },
      ],
    },

    {
      id: 'daily-records',
      title: 'Daily books and administrative routine',
      summary: 'The records the administrative routine maintains.',
      blocks: [
        {
          kind: 'list',
          items: [
            'NPT Daily Book — the day\'s activity record.',
            'Piano Moving Book — instrument movements.',
            'Instrument Repair Receiving Form — instruments taken in.',
            'Order Book — supply requests collected and ordered.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'These are being progressively represented by the platform\'s own records — intake, movement, workshop and procurement — so the daily ' +
            'book becomes a view over recorded work rather than a separate transcription.',
        },
        { kind: 'knowledge', titles: ['Nairobi Piano Technicians Operational Records'] },
      ],
    },

    {
      id: 'reporting',
      title: 'Management reporting',
      summary: 'What management watches.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Open jobs by age, and instruments held.',
            'Completed work for the period.',
            'Outstanding receivables.',
            'Follow-ups due and conversion from them.',
            'Parts consumption and stock position.',
          ],
        },
      ],
    },

    {
      id: 'live-data',
      title: 'Current entity data',
      summary: 'Live structured records for NPT.',
      blocks: [
        { kind: 'dynamic', source: 'people', title: 'People assigned to NPT' },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'dynamic', source: 'systems', title: 'Operational systems in use' },
      ],
    },
  ],
}
