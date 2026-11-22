import type { FieldDef, ModuleDef } from '../registry';

const status = (options: string[]): FieldDef => ({ key: 'status', label: 'Status', type: 'select', options, required: true });
const PROJECTS = ['Regal Park Phase 1 - Internal Roads', 'Regal Park Clubhouse Construction', 'Villa R-07 Interiors', 'Sterlitee Heights Tower B', 'Lakeview Villas Landscaping', 'Whitefield Plaza Fit-out', 'Green Meadows Plot Development', 'Orchid Apartments Possession Drive'];
const TAGS = ['Residential', 'Commercial', 'Interiors', 'Landscaping', 'Phase 1', 'Premium', 'Handover'];
const TAX = ['5%', '12%', '18%', '28%'];

export const MODULES: ModuleDef[] = [
  {
    key: 'sales', label: 'Sales', icon: 'Receipt', group: 'Sales & CRM',
    pages: [
      { key: 'dashboard', label: 'Dashboard', kind: 'dashboard' },
      { key: 'proposals', label: 'Proposals', kind: 'table', entity: 'sales_proposals' },
      { key: 'estimates', label: 'Estimates', kind: 'table', entity: 'sales_estimates' },
      { key: 'invoices', label: 'Invoices', kind: 'table', entity: 'sales_invoices' },
      { key: 'payments', label: 'Payments', kind: 'table', entity: 'sales_payments' },
      { key: 'credit_notes', label: 'Credit Notes', kind: 'table', entity: 'sales_credit_notes' },
      { key: 'items', label: 'Items', kind: 'table', entity: 'sales_items' },
    ],
    entities: [
      { key: 'sales_proposals', label: 'Proposals', singular: 'Proposal', prefix: 'PRO-', titleField: 'subject', statusField: 'status', dateField: 'date', amountField: 'total', seedCount: 12,
        fields: [
          { key: 'subject', label: 'Subject', type: 'text', required: true, pool: ['Villa booking - Regal Park R-07', '3BHK Sterlitee Heights', 'Premium interior package', 'Clubhouse annual membership', 'Plot purchase - Green Meadows', 'Maintenance contract AMC'] },
          { key: 'to', label: 'To', type: 'ref', ref: 'clients', required: true },
          { key: 'total', label: 'Total', type: 'money', min: 50000, max: 25000000 },
          { key: 'date', label: 'Date', type: 'date', gen: 'recent' },
          { key: 'openTill', label: 'Open Till', type: 'date', gen: 'future' },
          status(['Draft', 'Sent', 'Open', 'Revised', 'Declined', 'Accepted']),
        ] },
      { key: 'sales_estimates', label: 'Estimates', singular: 'Estimate', prefix: 'EST-', titleField: 'reference', statusField: 'status', dateField: 'date', amountField: 'amount', seedCount: 12,
        fields: [
          { key: 'reference', label: 'Reference', type: 'text', required: true, pool: ['Modular kitchen - Villa R-07', 'Wardrobe & lighting upgrade', 'Boundary landscaping', 'Solar rooftop add-on', 'Waterproofing 10-yr', 'Flooring upgrade - Marble'] },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients', required: true },
          { key: 'amount', label: 'Amount', type: 'money', min: 25000, max: 3000000 },
          { key: 'tax', label: 'Tax', type: 'money', min: 1000, max: 540000 },
          { key: 'date', label: 'Date', type: 'date', gen: 'recent' },
          { key: 'expiry', label: 'Expiry', type: 'date', gen: 'future' },
          status(['Draft', 'Sent', 'Expired', 'Declined', 'Accepted']),
        ] },
      { key: 'sales_invoices', label: 'Invoices', singular: 'Invoice', prefix: 'INV-S-', titleField: 'description', statusField: 'status', dateField: 'date', amountField: 'amount', seedCount: 14,
        fields: [
          { key: 'description', label: 'Description', type: 'text', required: true, pool: ['Villa booking amount', 'Second instalment - slab stage', 'Interior package advance', 'Clubhouse membership fee', 'Maintenance charges Q3', 'Possession stage payment'] },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients', required: true },
          { key: 'amount', label: 'Amount', type: 'money', min: 20000, max: 8000000 },
          { key: 'tax', label: 'Tax', type: 'money', min: 1000, max: 1400000 },
          { key: 'date', label: 'Date', type: 'date', gen: 'recent' },
          { key: 'dueDate', label: 'Due Date', type: 'date', gen: 'future' },
          status(['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']),
        ] },
      { key: 'sales_payments', label: 'Payments', singular: 'Payment', prefix: 'PAY-', titleField: 'transactionId', dateField: 'date', amountField: 'amount', seedCount: 14,
        fields: [
          { key: 'transactionId', label: 'Transaction ID', type: 'text', required: true, gen: 'serial' },
          { key: 'invoice', label: 'Invoice', type: 'ref', ref: 'sales_invoices' },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients' },
          { key: 'mode', label: 'Mode', type: 'select', options: ['UPI', 'NEFT', 'RTGS', 'Cheque', 'Cash'], required: true },
          { key: 'amount', label: 'Amount', type: 'money', min: 10000, max: 5000000 },
          { key: 'date', label: 'Date', type: 'date', gen: 'past' },
        ] },
      { key: 'sales_credit_notes', label: 'Credit Notes', singular: 'Credit Note', prefix: 'CN-', titleField: 'reference', statusField: 'status', dateField: 'date', amountField: 'amount', seedCount: 8,
        fields: [
          { key: 'reference', label: 'Reference', type: 'text', required: true, pool: ['Booking cancellation refund', 'Excess payment adjustment', 'Rate revision credit', 'Early payment rebate', 'Specification change credit', 'Duplicate billing correction'] },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients', required: true },
          { key: 'date', label: 'Date', type: 'date', gen: 'past' },
          { key: 'amount', label: 'Amount', type: 'money', min: 5000, max: 500000 },
          { key: 'remaining', label: 'Remaining', type: 'money', min: 0, max: 300000 },
          status(['Open', 'Closed', 'Void']),
        ] },
      { key: 'sales_items', label: 'Items', singular: 'Item', titleField: 'description', seedCount: 12,
        fields: [
          { key: 'description', label: 'Description', type: 'text', required: true, pool: ['Villa booking token', 'Modular kitchen package', 'Wardrobe set', 'Clubhouse membership - annual', 'Maintenance AMC - per month', 'Solar rooftop 5kW', 'Waterproofing treatment', 'Premium flooring per sqft'] },
          { key: 'longDescription', label: 'Long Description', type: 'textarea', list: false, gen: 'sentence' },
          { key: 'rate', label: 'Rate', type: 'money', min: 500, max: 2500000 },
          { key: 'tax1', label: 'Tax', type: 'select', options: TAX },
          { key: 'unit', label: 'Unit', type: 'select', options: ['Nos', 'Sq.ft', 'Month', 'Year', 'Lump sum'] },
          { key: 'group', label: 'Group', type: 'select', options: ['Bookings', 'Interiors', 'Memberships', 'Maintenance', 'Add-ons'] },
        ] },
    ],
  },
  {
    key: 'projects', label: 'Projects', icon: 'Briefcase', group: 'Sales & CRM',
    pages: [{ key: 'projects', label: 'Projects', kind: 'table', entity: 'projects_projects' }],
    entities: [
      { key: 'projects_projects', label: 'Projects', singular: 'Project', titleField: 'name', statusField: 'status', dateField: 'startDate', seedCount: 10,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: PROJECTS },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients' },
          { key: 'tags', label: 'Tags', type: 'text', pool: TAGS },
          { key: 'startDate', label: 'Start Date', type: 'date', gen: 'past' },
          { key: 'deadline', label: 'Deadline', type: 'date', gen: 'future' },
          { key: 'members', label: 'Members', type: 'ref', ref: 'users' },
          status(['Not Started', 'In Progress', 'On Hold', 'Cancelled', 'Finished']),
          { key: 'progress', label: 'Progress', type: 'percent', min: 0, max: 100 },
        ] },
    ],
  },
  {
    key: 'tasks', label: 'Tasks', icon: 'ClipboardCheck', group: 'Sales & CRM',
    pages: [{ key: 'tasks', label: 'Tasks', kind: 'table', entity: 'tasks_tasks' }],
    entities: [
      { key: 'tasks_tasks', label: 'Tasks', singular: 'Task', titleField: 'name', statusField: 'status', dateField: 'dueDate', kanban: true, calendar: true, seedCount: 15,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['Finalise tower B slab schedule', 'Collect RERA compliance documents', 'Follow up pending booking cheques', 'Approve clubhouse interior samples', 'Site inspection - Villa R-07', 'Prepare possession checklist', 'Update brochure pricing', 'Review contractor invoices'] },
          status(['Not Started', 'In Progress', 'Testing', 'Awaiting Feedback', 'Complete']),
          { key: 'startDate', label: 'Start Date', type: 'date', gen: 'past' },
          { key: 'dueDate', label: 'Due Date', type: 'date', required: true, gen: 'future' },
          { key: 'assignedTo', label: 'Assigned To', type: 'ref', ref: 'users' },
          { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'] },
          { key: 'relatedProject', label: 'Related Project', type: 'ref', ref: 'projects_projects' },
          { key: 'billable', label: 'Billable', type: 'checkbox' },
        ] },
    ],
  },
  {
    key: 'contracts_core', label: 'Contracts', icon: 'FileSignature', group: 'Sales & CRM',
    pages: [{ key: 'contracts', label: 'Contracts', kind: 'table', entity: 'contracts_core_contracts' }],
    entities: [
      { key: 'contracts_core_contracts', label: 'Contracts', singular: 'Contract', titleField: 'subject', dateField: 'startDate', amountField: 'value', seedCount: 12,
        fields: [
          { key: 'subject', label: 'Subject', type: 'text', required: true, pool: ['Sale agreement - Villa R-07', 'Annual maintenance - Regal Park', 'Lease deed - Whitefield Plaza shop', 'Interior works - Tower B 3BHK', 'Vendor agreement - RMC supply', 'Sale agreement - Plot 42 Green Meadows'] },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients' },
          { key: 'contractType', label: 'Contract Type', type: 'select', options: ['Sale Agreement', 'Maintenance', 'Lease', 'Interior Works', 'Vendor'], required: true },
          { key: 'value', label: 'Value', type: 'money', min: 100000, max: 30000000 },
          { key: 'startDate', label: 'Start Date', type: 'date', gen: 'past' },
          { key: 'endDate', label: 'End Date', type: 'date', gen: 'future' },
          { key: 'signed', label: 'Signed', type: 'checkbox' },
        ] },
    ],
  },
  {
    key: 'expenses', label: 'Expenses', icon: 'Wallet', group: 'Sales & CRM',
    pages: [{ key: 'expenses', label: 'Expenses', kind: 'table', entity: 'expenses_expenses' }],
    entities: [
      { key: 'expenses_expenses', label: 'Expenses', singular: 'Expense', titleField: 'name', dateField: 'date', amountField: 'amount', seedCount: 15,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['Cement purchase - 200 bags', 'Newspaper ad - launch weekend', 'Site visit travel', 'Electricity bill - site office', 'Site staff salaries', 'Registration & stamp duty', 'Broker commission - Villa R-07', 'Steel TMT bars'] },
          { key: 'category', label: 'Category', type: 'select', options: ['Site Materials', 'Marketing', 'Travel', 'Utilities', 'Salaries', 'Legal & Registration', 'Broker Commission'], required: true },
          { key: 'amount', label: 'Amount', type: 'money', min: 2000, max: 2500000 },
          { key: 'date', label: 'Date', type: 'date', gen: 'past' },
          { key: 'project', label: 'Project', type: 'text', pool: PROJECTS },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients' },
          { key: 'paymentMode', label: 'Payment Mode', type: 'select', options: ['UPI', 'NEFT', 'Cheque', 'Cash', 'Card'] },
          { key: 'vendor', label: 'Vendor', type: 'text', gen: 'company' },
          { key: 'reference', label: 'Reference', type: 'text', list: false, gen: 'serial' },
        ] },
    ],
  },
  {
    key: 'subscriptions', label: 'Subscriptions', icon: 'Receipt', group: 'Sales & CRM',
    pages: [{ key: 'subscriptions', label: 'Subscriptions', kind: 'table', entity: 'subscriptions_subscriptions' }],
    entities: [
      { key: 'subscriptions_subscriptions', label: 'Subscriptions', singular: 'Subscription', titleField: 'name', statusField: 'status', dateField: 'nextBilling', seedCount: 10,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['Clubhouse membership - Gold', 'Clubhouse membership - Family', 'Villa maintenance plan', 'Apartment maintenance plan', 'Landscaping AMC', 'Security & housekeeping plan'] },
          { key: 'client', label: 'Client', type: 'ref', ref: 'clients', required: true },
          { key: 'project', label: 'Project', type: 'text', pool: PROJECTS },
          status(['Active', 'Future', 'Past Due', 'Cancelled']),
          { key: 'nextBilling', label: 'Next Billing', type: 'date', gen: 'future' },
          { key: 'dateSubscribed', label: 'Date Subscribed', type: 'date', gen: 'past' },
        ] },
    ],
  },
  {
    key: 'estimate_request', label: 'Estimate Request', icon: 'Calculator', group: 'Sales & CRM',
    pages: [{ key: 'requests', label: 'Estimate Requests', kind: 'table', entity: 'estimate_request_requests' }],
    entities: [
      { key: 'estimate_request_requests', label: 'Estimate Requests', singular: 'Estimate Request', prefix: 'ER-', titleField: 'email', statusField: 'status', dateField: 'created', seedCount: 10,
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true, gen: 'email' },
          { key: 'tags', label: 'Tags', type: 'text', pool: TAGS },
          { key: 'assigned', label: 'Assigned', type: 'ref', ref: 'users' },
          status(['New', 'Processing', 'Quoted', 'Closed']),
          { key: 'created', label: 'Created', type: 'date', gen: 'recent' },
          { key: 'requirement', label: 'Requirement', type: 'textarea', pool: ['Need quote for 3BHK interior package with modular kitchen', 'Estimate for villa landscaping, 2400 sqft garden', 'Price for solar rooftop 5kW at Regal Park villa', 'Waterproofing quote for terrace 1800 sqft', 'Flooring upgrade estimate for 2BHK Tower B', 'Wardrobe and false ceiling estimate'] },
        ] },
    ],
  },
  {
    key: 'knowledge_base', label: 'Knowledge Base', icon: 'FolderOpen', group: 'Sales & CRM',
    pages: [{ key: 'articles', label: 'Articles', kind: 'table', entity: 'knowledge_base_articles' }],
    entities: [
      { key: 'knowledge_base_articles', label: 'Articles', singular: 'Article', titleField: 'name', dateField: 'published', seedCount: 10,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['How do I apply for a home loan?', 'What documents are needed for possession?', 'Understanding RERA carpet area', 'Maintenance charges explained', 'How to register your sale deed', 'Khata transfer process in Bengaluru', 'Booking amount refund policy', 'Defect liability period FAQ'] },
          { key: 'group', label: 'Group', type: 'select', options: ['FAQ', 'Home Loans', 'Possession', 'Maintenance', 'Legal'], required: true },
          { key: 'published', label: 'Published', type: 'date', gen: 'past' },
          { key: 'content', label: 'Content', type: 'textarea', list: false, gen: 'paragraph' },
        ] },
    ],
  },
];
