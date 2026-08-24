import type { ManualDocument } from '../model'

/**
 * ICELAND / GLITZ N' GLIM (§§26–27).
 *
 * Iceland Geyser Ltd is the company; Glitz N' Glim is its product brand. The
 * manual describes the complete chain from purchase requirement through to
 * field-sales reconciliation, built from the platform's actual inventory and
 * manufacturing architecture plus employee production, store, field-sales and
 * administrative routine records.
 */
export const icelandGlitzManual: ManualDocument = {
  ref: 'iceland-glitz-n-glim',
  title: 'Iceland / Glitz N\' Glim Operating System',
  entity: 'Iceland Geyser Ltd · Glitz N\' Glim',
  intro:
    'Iceland manufactures and sells household cleaning products under the Glitz N\' Glim brand. This manual describes the whole chain: what is ' +
    'bought, how it is received and stored, how it is issued to production, how it is made and checked, how finished goods reach the store, how ' +
    'they are issued into a sales team\'s custody, and how the day\'s selling is reconciled. Every step posts to one stock ledger, so the stock ' +
    'card is always the answer.',

  chapters: [
    {
      id: 'entity',
      title: 'Entity and identity',
      summary: 'The company, the brand, and what appears on a document.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Iceland Geyser Ltd is the legal entity. Glitz N\' Glim is the product brand it sells under. They share one brand record in the ' +
            'platform, which is why documents use the print identity rather than the marketing brand name: an invoice must carry the company, ' +
            'not the product line.',
        },
        {
          kind: 'callout',
          tone: 'warning',
          text:
            'A document\'s letterhead, its items, its stores and its numbering all resolve from the same entity. The system asks which entity a ' +
            'document belongs to rather than assuming, precisely so a document cannot carry one company\'s identity over another\'s goods.',
        },
      ],
    },

    {
      id: 'stock-classes',
      title: 'Stock classes and custody',
      summary: 'Four classes of stock, plus a custody layer that is not a store.',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Stock is classified so that a "total stock" figure can never silently mix ingredients with sellable product. The three production ' +
            'stores are kept visually and structurally apart in the system.',
        },
        {
          kind: 'list',
          items: [
            'Raw materials — chemicals and ingredients bought in for production.',
            'Packaging — bottles, caps, labels and cartons.',
            'Production / work in progress — material issued to a run and not yet finished.',
            'Finished goods — accepted, packed product available to sell.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Field-sales custody is a custody layer, not a second store',
          text:
            'Product issued to a sales team leaves the finished-goods store once and sits in that team\'s custody until it is sold, returned or ' +
            'accounted for. It is not deducted twice, and it is not a second stock balance. Custody is reconciled against sales and returns.',
        },
        { kind: 'systemLink', href: '/manufacturing', label: 'Manufacturing', description: 'The three stores, production runs and finished-goods transfers.' },
        { kind: 'systemLink', href: '/field-sales', label: 'Field Sales' },
      ],
    },

    {
      id: 'chain',
      title: 'The complete operating chain',
      summary: 'Purchase requirement to management reporting, in order.',
      blocks: [
        {
          kind: 'flow',
          title: 'End to end',
          steps: [
            'Purchase requirement identified',
            'Approved procurement',
            'Goods Received Note against the delivery',
            'Raw material or packaging store',
            'Material Requisition from production',
            'Goods Issue Note to production',
            'Production run / batch',
            'Quality control',
            'Packaging to pack specification',
            'Finished-goods receipt (accepted quantity only)',
            'Finished-goods store',
            'Delivery Note into sales custody',
            'Field sales',
            'Daily invoice and sales record',
            'Custody reconciliation',
            'Returns, damages and samples where authorised',
            'Management reporting',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Rejected output never becomes sellable stock',
          text:
            'Only the accepted quantity from a run is received into finished goods. Rejected units are recorded as rejected. A run that made 100 ' +
            'and accepted 92 adds 92 to the store, not 100.',
        },
      ],
    },

    {
      id: 'receiving',
      title: 'Receiving goods',
      summary: 'How purchased material enters the business.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Book in exactly what the supplier actually delivered, against the order, with the ledger updated at the moment of receipt.' },
            { label: 'Normal flow', value: 'Delivery arrives → checked against the order and the delivery documentation → Goods Received Note raised per line → stock register updated.' },
            { label: 'Responsible', value: 'Store keeper receives and checks; procurement resolves discrepancies with the supplier.' },
            { label: 'Records', value: 'Goods Received Note, and one movement line per item carrying the document id that caused it.' },
            { label: 'Management control', value: 'Short, damaged or substituted deliveries are recorded as received-as-delivered and escalated, not silently adjusted to match the order.' },
            { label: 'Escalation', value: 'Quality failures on receipt, repeated shortfalls and price variances go to the Iceland manager.' },
            { label: 'In the system', value: 'Goods Received Note, reachable from Inventory and Procurement.' },
          ],
        },
        { kind: 'systemLink', href: '/procurement', label: 'Procurement' },
        { kind: 'systemLink', href: '/inventory', label: 'Inventory' },
      ],
    },

    {
      id: 'store-operations',
      title: 'Store operations',
      summary: 'The daily store routine.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Open the chemical and soap stores.',
            'Physically check stock against the register.',
            'Record the previous day\'s sales.',
            'Update stock cards.',
            'Issue supplies and resources against approved requests.',
            'Issue product to the sales team and record the Delivery Note.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'One ledger',
          text:
            'The stock card is derived from the movement ledger. Nothing outside it should maintain a parallel balance. A hand-kept total that ' +
            'disagrees with the stock card is an error to investigate, not a second opinion to reconcile against.',
        },
        { kind: 'systemLink', href: '/inventory/stock-cards', label: 'Stock cards' },
      ],
    },

    {
      id: 'material-requisition',
      title: 'Material requisition and issue to production',
      summary: 'How production draws what it needs.',
      blocks: [
        {
          kind: 'flow',
          title: 'Requisition to issue',
          steps: [
            'Production raises a Material Requisition',
            'Store checks available quantity',
            'Available stock is issued on a Goods Issue Note',
            'Any shortfall is identified and recorded',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Issuing material deducts it from the store at the moment of issue. The requisition records what was asked for; the issue note records ' +
            'what was actually given. Where those differ, the difference is the shortfall, and it is visible rather than absorbed.',
        },
        { kind: 'systemLink', href: '/manufacturing', label: 'Manufacturing' },
      ],
    },

    {
      id: 'shortfall-purchasing',
      title: 'Shortfall and stock purchasing',
      summary: 'What happens when the store cannot fill a requisition.',
      blocks: [
        {
          kind: 'flow',
          title: 'Intended controlled workflow',
          steps: [
            'Production Material Requisition raised',
            'Store checks available quantity',
            'Available stock issued',
            'Shortfall identified',
            'Store Purchase Request raised for the shortfall',
            'Iceland manager reviews the recommended purchase quantities',
            'Manager may change a quantity, with the reason recorded',
            'Approval',
            'Procurement to supplier',
            'Goods Received Note',
            'Inventory updated',
            'Issue to production',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Throughout, these stay separately visible and are never collapsed into one number:',
        },
        {
          kind: 'list',
          items: [
            'Quantity production requested.',
            'Quantity available in store.',
            'Shortfall.',
            'Quantity the store recommends purchasing.',
            'Quantity the manager approved.',
            'The manager\'s reason for any adjustment.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'A requisition is not a purchase request',
          text:
            'The original production Material Requisition is never mutated into a purchase request. They are different documents answering ' +
            'different questions — "what does production need?" and "what are we buying?" — and the relationship between them is exactly what the ' +
            'shortfall record captures.',
        },
        {
          kind: 'callout',
          tone: 'note',
          title: 'Not yet a system object',
          text:
            'The distinct Store Purchase Request document described above is the intended controlled workflow. It is not yet built as its own ' +
            'screen in the platform. Until it is, shortfalls are handled through the existing requisition and procurement records, and this chapter ' +
            'states the intended control rather than describing a screen that does not exist.',
        },
      ],
    },

    {
      id: 'production',
      title: 'Production',
      summary: 'Running a batch.',
      blocks: [
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Convert issued raw material and packaging into accepted, packed finished goods, with the quantities recorded at each stage.' },
            { label: 'Normal flow', value: 'Report and open production → handle raw material → batch production → quality control → packaging to specification → transfer accepted quantity to finished goods.' },
            { label: 'Responsible', value: 'Production staff run the batch; the Iceland manager approves a suggestion into a real run.' },
            { label: 'Records', value: 'Production run with planned, actual and rejected quantities, batch number, material consumption, and the finished-goods transfer.' },
            { label: 'Management control', value: 'Material consumed is reconciled against the run. Production suggestions are suggestions — a manager approves one into a run; nothing starts production by itself.' },
            { label: 'Escalation', value: 'Equipment failure, quality failure and material variance are escalated rather than worked around.' },
          ],
        },
        {
          kind: 'list',
          items: [
            'Products made include soap, handwash, multipurpose cleaner, dishwash, fabric softener and shower gel, among others.',
            'Raw material handling, equipment operation and equipment maintenance are part of the run, not separate afterthoughts.',
            'Quality-control checks are performed and recorded during the run.',
            'Packaging follows the pack specification for the product.',
            'Produced quantities are transferred to the finished-goods store and the transferred quantity recorded.',
            'Safety, cleaning and hygiene apply throughout; the area is left clean.',
            'Troubleshooting and teamwork are expected; unresolved problems are escalated with what was already tried.',
          ],
        },
      ],
    },

    {
      id: 'field-sales',
      title: 'Field sales and custody',
      summary: 'Product leaving the store with a person.',
      blocks: [
        {
          kind: 'flow',
          title: 'Field sales day',
          steps: [
            'Start-of-day reconciliation of the previous day',
            'Sales Day Book brought up to date',
            'Short team meeting',
            'Product allocated to each salesperson',
            'Allocation recorded on a Delivery Note into custody',
            'Team leaves for sales',
            'Selling',
            'Return, count and reconcile custody',
            'Day\'s invoices and sales recorded',
          ],
        },
        {
          kind: 'control',
          rows: [
            { label: 'Purpose', value: 'Know at all times what product is out with which person, and reconcile it against what was sold, returned or is unaccounted for.' },
            { label: 'Records', value: 'Delivery Note, allocation record, Sales Day Book, invoices, returns.' },
            { label: 'Management control', value: 'Custody is reconciled daily. An unreconciled allocation is an open item, not a rounding difference.' },
            { label: 'Escalation', value: 'Shortfalls, damages and unauthorised discounts are escalated to the Iceland manager with the reconciliation attached.' },
          ],
        },
        { kind: 'knowledge', titles: ['Iceland Field Sales Custody and Sales Reconciliation'] },
      ],
    },

    {
      id: 'sales-admin',
      title: 'Sales administration',
      summary: 'The daily administrative cycle around selling.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Process the previous day\'s sales invoices.',
            'Review pending orders.',
            'Maintain the Sales Book and the Order Book.',
            'Carry out the morning facility inspection.',
            'Complete end-of-day sales invoicing and reconciliation.',
          ],
        },
        {
          kind: 'paragraph',
          text:
            'An invoice moves finished goods out of stock exactly once — the invoice line carries a unique reference into the movement ledger, so ' +
            'a re-posted invoice cannot double-deduct.',
        },
      ],
    },

    {
      id: 'returns',
      title: 'Returns, damages and samples',
      summary: 'Product that comes back or goes out without a sale.',
      blocks: [
        {
          kind: 'list',
          items: [
            'Returns come back into the appropriate stock class, not automatically into sellable finished goods.',
            'Damaged product is recorded as damaged and removed from sellable stock.',
            'Samples issued for promotion are authorised and recorded, so they are not mistaken for shrinkage.',
          ],
        },
        {
          kind: 'callout',
          tone: 'note',
          text:
            'Each of these is an authorised movement with a reason. Stock that changes class without a movement record is the beginning of an ' +
            'unexplainable variance.',
        },
      ],
    },

    {
      id: 'live-data',
      title: 'Current entity data',
      summary: 'Live structured records for Iceland.',
      blocks: [
        { kind: 'dynamic', source: 'people', title: 'People assigned to Iceland' },
        { kind: 'dynamic', source: 'duties', title: 'Active recurring duties' },
        { kind: 'dynamic', source: 'authorities', title: 'Recorded authorities' },
        { kind: 'dynamic', source: 'systems', title: 'Operational systems in use' },
        { kind: 'knowledge', titles: ['Iceland Manufacturing Stock Flow', 'Procurement, Receiving and Inventory Control'] },
      ],
    },
  ],
}
