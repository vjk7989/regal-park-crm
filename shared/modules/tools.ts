import type { FieldDef, ModuleDef } from '../registry';

const status = (options: string[]): FieldDef => ({ key: 'status', label: 'Status', type: 'select', options, required: true });
const name = (pool: string[]): FieldDef => ({ key: 'name', label: 'Name', type: 'text', required: true, pool });
const lookup = (key: string, label: string, singular: string, pool: string[]) => ({ key, label, singular, titleField: 'name', lookup: true, seedCount: pool.length, fields: [name(pool)] });
const FILES = ['Regal Park Brochure.pdf', 'Sale Agreement Template.docx', 'RERA Certificate.pdf', 'Villa Floor Plans.zip', 'Site Survey Report.pdf', 'Price List Q3.xlsx', 'Approved Layout - Devanahalli.pdf', 'Possession Checklist.docx'];
const FOLDERS = ['Legal', 'Marketing', 'Site Documents', 'Sales Collateral', 'Finance', 'HR'];

export const MODULES: ModuleDef[] = [
  {
    key: 'file_sharing', label: 'File Sharing', icon: 'FolderOpen', group: 'Tools',
    pages: [
      { key: 'files', label: 'Files', kind: 'table', entity: 'file_sharing_files' },
      { key: 'shares', label: 'Shares', kind: 'table', entity: 'file_sharing_shares' },
      { key: 'downloads', label: 'Downloads', kind: 'table', entity: 'file_sharing_downloads' },
      { key: 'report', label: 'Report', kind: 'report', entities: ['file_sharing_files', 'file_sharing_shares', 'file_sharing_downloads'] },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'defaultExpiryDays', label: 'Default link expiry (days)', type: 'number', pool: ['7', '14', '30'], min: 1 },
      { key: 'maxUploadMb', label: 'Max upload size (MB)', type: 'number', pool: ['25', '50', '100'], min: 1 },
      { key: 'requirePassword', label: 'Require password on public shares', type: 'checkbox' },
    ],
    entities: [
      { key: 'file_sharing_files', label: 'Files', singular: 'File', titleField: 'name', dateField: 'updated', seedCount: 12,
        fields: [name(FILES), { key: 'folder', label: 'Folder', type: 'select', options: FOLDERS }, { key: 'size', label: 'Size (KB)', type: 'number', min: 20, max: 48000 }, { key: 'owner', label: 'Owner', type: 'ref', ref: 'staff' }, { key: 'updated', label: 'Updated', type: 'date', gen: 'recent' }] },
      { key: 'file_sharing_shares', label: 'Shares', singular: 'Share', titleField: 'name', statusField: 'status', dateField: 'expiry', seedCount: 10,
        fields: [
          { key: 'hash', label: 'Hash', type: 'text', gen: 'hash' }, name(FILES),
          { key: 'type', label: 'Type', type: 'select', options: ['Client', 'Public'], required: true },
          { key: 'expiry', label: 'Expiry', type: 'date', gen: 'future' },
          { key: 'downloadLimit', label: 'Download Limit', type: 'number', min: 1, max: 50 },
          { key: 'downloads', label: 'Downloads', type: 'number', min: 0, max: 50 },
          status(['Active', 'Expired', 'Revoked']),
        ] },
      { key: 'file_sharing_downloads', label: 'Downloads', singular: 'Download', titleField: 'share', dateField: 'date', seedCount: 14,
        fields: [{ key: 'share', label: 'Share', type: 'ref', ref: 'file_sharing_shares', required: true }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'client', label: 'Client', type: 'ref', ref: 'clients' }, { key: 'ip', label: 'IP Address', type: 'text', pool: ['103.21.58.14', '49.37.201.9', '157.45.12.88', '106.51.74.120', '122.172.85.3', '117.200.43.61'] }] },
      lookup('file_sharing_folders', 'Folders', 'Folder', FOLDERS),
    ],
  },
  {
    key: 'spreadsheets', label: 'Spreadsheet Online', icon: 'Sheet', group: 'Tools',
    pages: [{ key: 'files', label: 'Files', kind: 'table', entity: 'spreadsheets_files' }],
    entities: [
      { key: 'spreadsheets_files', label: 'Files', singular: 'Spreadsheet', titleField: 'name', dateField: 'created', seedCount: 10,
        fields: [name(['Unit Inventory Tracker', 'Collections Schedule', 'Cement Rate Comparison', 'Site Visit Log', 'Brokerage Payout Sheet', 'Marketing Budget FY26', 'Material Reconciliation', 'Possession Schedule']), { key: 'kind', label: 'Kind', type: 'select', options: ['File', 'Folder'] }, { key: 'relatedTo', label: 'Related To', type: 'text', pool: ['Regal Park', 'Villa Phase 2', 'Devanahalli Plots', 'Whitefield Heights', 'General'] }, { key: 'owner', label: 'Owner', type: 'ref', ref: 'staff' }, { key: 'shared', label: 'Shared', type: 'checkbox' }, { key: 'created', label: 'Created', type: 'date', gen: 'past' }] },
    ],
  },
  {
    key: 'report_builder', label: 'Report Builder', icon: 'BarChart3', group: 'Tools',
    pages: [
      { key: 'reports', label: 'Reports', kind: 'table', entity: 'report_builder_reports' },
      { key: 'templates', label: 'Templates', kind: 'table', entity: 'report_builder_templates' },
      { key: 'sharings', label: 'Sharings', kind: 'table', entity: 'report_builder_sharings' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'defaultFormat', label: 'Default export format', type: 'select', options: ['PDF', 'Excel', 'CSV'] },
      { key: 'includeLogo', label: 'Include company logo', type: 'checkbox' },
    ],
    entities: [
      { key: 'report_builder_reports', label: 'Reports', singular: 'Report', titleField: 'title', dateField: 'date', seedCount: 10,
        fields: [{ key: 'title', label: 'Title', type: 'text', required: true, pool: ['Monthly Collections Summary', 'Unit Sales by Project', 'Broker Commission Payable', 'Outstanding Receivables', 'Site Expense Breakdown', 'Lead Source Performance'] }, { key: 'category', label: 'Category', type: 'ref', ref: 'report_builder_categories' }, { key: 'preparedBy', label: 'Prepared By', type: 'ref', ref: 'staff' }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }] },
      { key: 'report_builder_templates', label: 'Templates', singular: 'Template', titleField: 'name', seedCount: 6,
        fields: [name(['Sales Summary', 'Collections Aging', 'Project Cost vs Budget', 'Lead Funnel', 'Brokerage Statement', 'Occupancy Report']), { key: 'category', label: 'Category', type: 'ref', ref: 'report_builder_categories' }] },
      { key: 'report_builder_sharings', label: 'Sharings', singular: 'Sharing', titleField: 'report', dateField: 'date', seedCount: 8,
        fields: [{ key: 'report', label: 'Report', type: 'ref', ref: 'report_builder_reports', required: true }, { key: 'sharedWith', label: 'Shared With', type: 'ref', ref: 'staff' }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'access', label: 'Access', type: 'select', options: ['View', 'Edit'] }] },
      lookup('report_builder_categories', 'Categories', 'Category', ['Sales', 'Finance', 'Operations', 'Marketing', 'HR', 'Compliance']),
    ],
  },
  {
    key: 'team_passwords', label: 'Team Passwords', icon: 'KeyRound', group: 'Tools',
    pages: [
      { key: 'dashboard', label: 'Dashboard', kind: 'dashboard' },
      { key: 'passwords', label: 'Passwords', kind: 'table', entity: 'team_passwords_passwords' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'rotationDays', label: 'Rotation reminder (days)', type: 'number', pool: ['60', '90', '180'], min: 1 },
      { key: 'notifyOnView', label: 'Notify owner on view', type: 'checkbox' },
    ],
    entities: [
      { key: 'team_passwords_passwords', label: 'Passwords', singular: 'Password', titleField: 'name', dateField: 'lastRotated', seedCount: 10,
        fields: [
          name(['Company Gmail Admin', 'HDFC Current Account', 'Tally Server', 'Website Hosting Panel', 'CCTV DVR - Site Office', 'AutoCAD Licence', 'GST Portal', 'RERA Karnataka Login']),
          { key: 'category', label: 'Category', type: 'ref', ref: 'team_passwords_categories' },
          { key: 'type', label: 'Type', type: 'select', options: ['Normal', 'Bank account', 'Email', 'Server', 'Software license'], required: true },
          { key: 'secret', label: 'Secret', type: 'text', pool: ['••••••••'] },
          { key: 'addedBy', label: 'Added By', type: 'ref', ref: 'staff' },
          { key: 'lastRotated', label: 'Last Rotated', type: 'date', gen: 'past' },
        ] },
      lookup('team_passwords_categories', 'Categories', 'Category', ['Banking', 'Email', 'Servers', 'Software', 'Government Portals', 'Social Media']),
    ],
  },
  {
    key: 'mentions', label: '@Mention', icon: 'AtSign', group: 'Tools',
    pages: [
      { key: 'posts', label: 'Posts', kind: 'table', entity: 'mentions_posts' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'emailOnMention', label: 'Email on mention', type: 'checkbox' },
      { key: 'digestHour', label: 'Daily digest hour', type: 'number', pool: ['9', '18'], min: 0, max: 23 },
    ],
    entities: [
      { key: 'mentions_posts', label: 'Posts', singular: 'Post', prefix: 'POST-', titleField: 'content', statusField: 'status', dateField: 'date', kanban: true, seedCount: 12,
        fields: [
          { key: 'content', label: 'Content', type: 'text', required: true, pool: ['Please review the Regal Park price list before Monday', 'Site inspection scheduled for Saturday at Devanahalli', 'RERA quarterly update needs sign-off', 'Brokerage payouts ready for approval', 'Updated floor plans uploaded for Villa Phase 2', 'Cement vendor rates revised this week'] },
          { key: 'author', label: 'Author', type: 'ref', ref: 'staff' },
          { key: 'mentions', label: 'Mentions', type: 'ref', ref: 'staff' },
          { key: 'date', label: 'Date', type: 'date', gen: 'recent' },
          status(['Open', 'Seen', 'Actioned', 'Closed']),
        ] },
    ],
  },
  {
    key: 'utilities', label: 'Utilities', icon: 'Briefcase', group: 'Tools',
    pages: [
      { key: 'announcements', label: 'Announcements', kind: 'table', entity: 'utilities_announcements' },
      { key: 'activity_log', label: 'Activity Log', kind: 'table', entity: 'utilities_activity_log' },
      { key: 'ticket_pipe_log', label: 'Ticket Pipe Log', kind: 'table', entity: 'utilities_ticket_pipe_log' },
      { key: 'calendar', label: 'Calendar', kind: 'calendar' },
      { key: 'media', label: 'Media', kind: 'info', text: 'Media library: shared images, brochures and site photos are managed under File Sharing. This page is a placeholder for a future central media browser.' },
      { key: 'bulk_pdf_export', label: 'Bulk PDF Export', kind: 'info', text: 'Bulk PDF Export lets you export invoices, estimates, proposals and payments for a date range as a single archive. This page is a placeholder in the demo.' },
    ],
    entities: [
      { key: 'utilities_announcements', label: 'Announcements', singular: 'Announcement', titleField: 'name', dateField: 'date', seedCount: 8,
        fields: [name(['Diwali holiday schedule', 'RERA audit next week', 'New CRM training session', 'Site safety drill on Friday', 'Office shifting to Hebbal', 'Q3 sales targets announced']), { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'message', label: 'Message', type: 'textarea', list: false, gen: 'paragraph' }] },
      { key: 'utilities_activity_log', label: 'Activity Log', singular: 'Activity', titleField: 'description', dateField: 'date', seedCount: 15,
        fields: [{ key: 'description', label: 'Description', type: 'text', required: true, pool: ['Created invoice for Regal Park unit A-402', 'Updated lead status to Site Visit', 'Approved purchase order for cement', 'Added new broker', 'Marked payment as received', 'Uploaded sale agreement'] }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'staff', label: 'Staff', type: 'ref', ref: 'staff' }] },
      { key: 'utilities_ticket_pipe_log', label: 'Ticket Pipe Log', singular: 'Pipe Log', titleField: 'subject', statusField: 'status', dateField: 'date', seedCount: 8,
        fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true, pool: ['Re: Possession date query', 'Maintenance request - Villa 14', 'Payment receipt required', 'Parking allotment issue', 'Re: Registration documents'] }, { key: 'from', label: 'From', type: 'email', gen: 'email' }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, status(['Success', 'Blocked', 'Failed'])] },
    ],
  },
  {
    key: 'reports_core', label: 'Reports', icon: 'BarChart3', group: 'Tools',
    pages: [
      { key: 'sales', label: 'Sales', kind: 'info', text: 'Sales reports live in the Sales & CRM modules (Invoices, Estimates, Proposals, Payments). Open the Report page of those modules for totals and charts.' },
      { key: 'expenses', label: 'Expenses', kind: 'info', text: 'Expense reports are available from the Expenses module in the Finance group, with category and project breakdowns.' },
      { key: 'expenses_vs_income', label: 'Expenses vs Income', kind: 'info', text: 'Compare the Expenses module totals with the Payments and Invoices reports to see monthly expenses against income.' },
      { key: 'leads', label: 'Leads', kind: 'info', text: 'Lead source, status and conversion reports are available on the Leads module report page.' },
      { key: 'timesheets_overview', label: 'Timesheets Overview', kind: 'info', text: 'Timesheet summaries per staff member and project are available from the Timesheets report in the People modules.' },
      { key: 'kb_articles', label: 'KB Articles', kind: 'info', text: 'Knowledge base article views and ratings are available from the Knowledge Base module report page.' },
    ],
    entities: [],
  },
];
