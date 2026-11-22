import type { FieldDef, ModuleDef } from '../registry';

const status = (options: string[]): FieldDef => ({ key: 'status', label: 'Status', type: 'select', options, required: true });
const name = (pool: string[]): FieldDef => ({ key: 'name', label: 'Name', type: 'text', required: true, pool });
const WORKSPACES = ['Sterlitee Corporate', 'Regal Park Launch', 'Villa Phase 2 Campaign', 'Whitefield Plots', 'NRI Outreach', 'Brand Awareness FY26'];
const SEGMENTS = ['First-time Homebuyers', 'NRI Investors', 'IT Professionals - Whitefield', 'Senior Citizens', 'Plot Buyers - Devanahalli', 'Repeat Customers'];
const CHANNELS = ['Organic', 'Paid', 'Direct', 'Social', 'Referral', 'Email'];
const NETWORKS = ['Facebook', 'Instagram', 'YouTube', 'X', 'LinkedIn'];
const lookup = (key: string, label: string, singular: string, pool: string[]) => ({ key, label, singular, titleField: 'name', lookup: true, seedCount: pool.length, fields: [name(pool)] });
const workspaces = (mod: string) => { const { lookup: _l, ...e } = lookup(`${mod}_workspaces`, 'Workspaces', 'Workspace', WORKSPACES); return e; };

export const MODULES: ModuleDef[] = [
  {
    key: 'marketing_planner', label: 'Marketing Planner', icon: 'Megaphone', group: 'Marketing',
    pages: [
      { key: 'planners', label: 'Planners', kind: 'table', entity: 'marketing_planner_planners' },
      { key: 'segments', label: 'Segments', kind: 'table', entity: 'marketing_planner_segments' },
      { key: 'components', label: 'Components', kind: 'table', entity: 'marketing_planner_components' },
      { key: 'channels', label: 'Channels', kind: 'table', entity: 'marketing_planner_channels' },
      { key: 'report', label: 'Report', kind: 'report', entities: ['marketing_planner_planners', 'marketing_planner_components'] },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'defaultCurrency', label: 'Default currency', type: 'select', options: ['INR', 'USD', 'AED'] },
      { key: 'budgetAlertPercent', label: 'Budget alert (%)', type: 'number', pool: ['80', '90', '75'], min: 0, max: 100 },
    ],
    entities: [
      { key: 'marketing_planner_planners', label: 'Planners', singular: 'Planner', prefix: 'MKP-', titleField: 'name', statusField: 'status', dateField: 'start', amountField: 'budget', seedCount: 10,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['Regal Park Pre-launch Plan', 'Diwali Offer Plan', 'Akshaya Tritiya Plots Drive', 'NRI Roadshow Dubai', 'Villa Phase 2 Hoardings', 'Monsoon Site Visit Drive'] },
          status(['Draft', 'Active', 'Paused', 'Completed']),
          { key: 'type', label: 'Type', type: 'select', options: ['Digital', 'Offline'], required: true },
          { key: 'start', label: 'Start', type: 'date', gen: 'recent' },
          { key: 'end', label: 'End', type: 'date', gen: 'future' },
          { key: 'budget', label: 'Budget', type: 'money', min: 50000, max: 5000000 },
        ] },
      { key: 'marketing_planner_segments', label: 'Segments', singular: 'Segment', titleField: 'name', seedCount: 6,
        fields: [name(SEGMENTS), { key: 'size', label: 'Audience Size', type: 'number', min: 500, max: 50000 }, { key: 'description', label: 'Description', type: 'textarea', list: false, gen: 'sentence' }] },
      { key: 'marketing_planner_components', label: 'Components', singular: 'Component', titleField: 'name', amountField: 'cost', seedCount: 10,
        fields: [
          name(['Hoarding - Hebbal Flyover', 'Google Search Ads', 'Instagram Reels', 'Newspaper Insert - Deccan Herald', 'Brochure Printing', 'Site Banner', 'WhatsApp Broadcast']),
          { key: 'planner', label: 'Planner', type: 'ref', ref: 'marketing_planner_planners' },
          { key: 'segment', label: 'Segment', type: 'ref', ref: 'marketing_planner_segments' },
          { key: 'cost', label: 'Cost', type: 'money', min: 5000, max: 800000 },
        ] },
      { key: 'marketing_planner_channels', label: 'Channels', singular: 'Channel', titleField: 'name', seedCount: 6,
        fields: [name(['Google Ads', 'Meta Ads', 'Print Media', 'Outdoor Hoardings', 'Radio - Radio City', 'Property Portals']), { key: 'type', label: 'Type', type: 'select', options: ['Digital', 'Offline'] }] },
      lookup('marketing_planner_budget_heads', 'Budget Heads', 'Budget Head', ['Creative', 'Media Buying', 'Events', 'Printing', 'Influencers', 'Content']),
    ],
  },
  {
    key: 'marketing_automation', label: 'Marketing Automation', icon: 'Workflow', group: 'Marketing',
    pages: [
      { key: 'dashboard', label: 'Dashboard', kind: 'dashboard' },
      { key: 'segments', label: 'Segments', kind: 'table', entity: 'marketing_automation_segments' },
      { key: 'components', label: 'Components', kind: 'table', entity: 'marketing_automation_components' },
      { key: 'campaigns', label: 'Campaigns', kind: 'table', entity: 'marketing_automation_campaigns' },
      { key: 'channels', label: 'Channels', kind: 'table', entity: 'marketing_automation_channels' },
      { key: 'point_actions', label: 'Point Actions', kind: 'table', entity: 'marketing_automation_point_actions' },
      { key: 'stages', label: 'Stages', kind: 'table', entity: 'marketing_automation_stages' },
      { key: 'report', label: 'Report', kind: 'report', entities: ['marketing_automation_campaigns', 'marketing_automation_segments'] },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'defaultChannel', label: 'Default channel', type: 'select', options: ['Email', 'SMS', 'WhatsApp'] },
      { key: 'sendWindowStart', label: 'Send window start (hour)', type: 'number', pool: ['9', '10'], min: 0, max: 23 },
      { key: 'respectDnd', label: 'Respect DND registry', type: 'checkbox' },
    ],
    entities: [
      { key: 'marketing_automation_segments', label: 'Segments', singular: 'Segment', titleField: 'name', seedCount: 6,
        fields: [name(SEGMENTS), { key: 'contacts', label: 'Contacts', type: 'number', min: 200, max: 30000 }, { key: 'rule', label: 'Rule', type: 'text', pool: ['Budget above 80L', 'Visited site in 30 days', 'Enquired via 99acres', 'Opened last 3 emails', 'City = Dubai', 'Booked before'] }] },
      { key: 'marketing_automation_components', label: 'Components', singular: 'Component', titleField: 'name', seedCount: 8,
        fields: [name(['Welcome Email', 'Site Visit Reminder SMS', 'Brochure WhatsApp Message', 'Payment Milestone Notice', 'Festive Offer Mailer', 'Possession Update']), { key: 'type', label: 'Type', type: 'select', options: ['Email', 'SMS', 'WhatsApp'] }, { key: 'body', label: 'Content', type: 'textarea', list: false, gen: 'sentence' }] },
      { key: 'marketing_automation_channels', label: 'Channels', singular: 'Channel', titleField: 'name', seedCount: 3,
        fields: [name(['Email', 'SMS', 'WhatsApp']), { key: 'provider', label: 'Provider', type: 'text', pool: ['Amazon SES', 'MSG91', 'Gupshup'] }] },
      { key: 'marketing_automation_campaigns', label: 'Campaigns', singular: 'Campaign', prefix: 'CMP-', titleField: 'name', statusField: 'status', dateField: 'start', kanban: true, seedCount: 12,
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, pool: ['Regal Park Pre-launch Drip', 'Diwali Site Visit Offer', 'NRI Webinar Follow-up', 'Villa Phase 2 Teaser', 'Abandoned Enquiry Revival', 'Possession Ready Homes'] },
          status(['Draft', 'Scheduled', 'Running', 'Paused', 'Completed']),
          { key: 'segment', label: 'Segment', type: 'ref', ref: 'marketing_automation_segments' },
          { key: 'channel', label: 'Channel', type: 'ref', ref: 'marketing_automation_channels' },
          { key: 'start', label: 'Start', type: 'date', gen: 'recent' },
          { key: 'sent', label: 'Sent', type: 'number', min: 0, max: 20000 },
          { key: 'conversions', label: 'Conversions', type: 'number', min: 0, max: 400 },
        ] },
      { key: 'marketing_automation_point_actions', label: 'Point Actions', singular: 'Point Action', titleField: 'name', seedCount: 6,
        fields: [name(['Opened email', 'Clicked brochure link', 'Visited site', 'Requested callback', 'Replied on WhatsApp', 'Booked unit']), { key: 'points', label: 'Points', type: 'number', min: 1, max: 100 }] },
      { key: 'marketing_automation_stages', label: 'Stages', singular: 'Stage', titleField: 'name', seedCount: 5,
        fields: [name(['Subscriber', 'Engaged', 'Qualified', 'Site Visited', 'Customer']), { key: 'order', label: 'Order', type: 'number', min: 1, max: 10 }] },
      lookup('marketing_automation_tags', 'Tags', 'Tag', ['Hot', 'Warm', 'Cold', 'NRI', 'Investor', 'End-user']),
    ],
  },
  {
    key: 'smart_page', label: 'Smart Page', icon: 'Target', group: 'Marketing',
    pages: [
      { key: 'workspaces', label: 'Workspaces', kind: 'table', entity: 'smart_page_workspaces' },
      { key: 'goals', label: 'Goals', kind: 'table', entity: 'smart_page_goals' },
      { key: 'funnels', label: 'Funnels', kind: 'table', entity: 'smart_page_funnels' },
      { key: 'acquisition', label: 'Acquisition', kind: 'dashboard' },
      { key: 'behaviour', label: 'Behaviour', kind: 'dashboard' },
      { key: 'heatmaps', label: 'Heatmaps', kind: 'table', entity: 'smart_page_heatmaps' },
      { key: 'form_analytics', label: 'Form Analytics', kind: 'table', entity: 'smart_page_form_analytics' },
      { key: 'surveys', label: 'Surveys', kind: 'table', entity: 'smart_page_surveys' },
    ],
    entities: [
      { key: 'smart_page_workspaces', label: 'Workspaces', singular: 'Workspace', titleField: 'name', seedCount: 6,
        fields: [name(WORKSPACES), { key: 'domain', label: 'Domain', type: 'url', pool: ['https://sterlitee.example/regal-park', 'https://sterlitee.example/villas', 'https://sterlitee.example/plots', 'https://sterlitee.example/nri'] }] },
      { key: 'smart_page_goals', label: 'Goals', singular: 'Goal', titleField: 'name', statusField: 'status', seedCount: 8,
        fields: [name(['Enquiry form submit', 'Brochure download', 'Site visit booking', 'Call button click', 'Virtual tour completed']), { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'smart_page_workspaces' }, { key: 'target', label: 'Monthly Target', type: 'number', min: 20, max: 800 }, { key: 'achieved', label: 'Achieved', type: 'number', min: 0, max: 800 }, status(['Active', 'Paused'])] },
      { key: 'smart_page_funnels', label: 'Funnels', singular: 'Funnel', titleField: 'name', seedCount: 6,
        fields: [name(['Landing to Enquiry', 'Brochure to Site Visit', 'Visit to Booking', 'Ad Click to Call']), { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'smart_page_workspaces' }, { key: 'steps', label: 'Steps', type: 'number', min: 2, max: 6 }, { key: 'conversion', label: 'Conversion', type: 'percent', min: 1, max: 35 }] },
      { key: 'smart_page_heatmaps', label: 'Heatmaps', singular: 'Heatmap', titleField: 'page', dateField: 'date', seedCount: 8,
        fields: [{ key: 'page', label: 'Page', type: 'text', required: true, pool: ['/regal-park', '/villas/phase-2', '/plots/devanahalli', '/contact', '/nri-invest', '/floor-plans'] }, { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'smart_page_workspaces' }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'clicks', label: 'Clicks', type: 'number', min: 100, max: 9000 }] },
      { key: 'smart_page_form_analytics', label: 'Form Analytics', singular: 'Form', titleField: 'form', seedCount: 8,
        fields: [{ key: 'form', label: 'Form', type: 'text', required: true, pool: ['Enquiry Form', 'Site Visit Booking', 'Brochure Download', 'Callback Request', 'NRI Interest Form'] }, { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'smart_page_workspaces' }, { key: 'views', label: 'Views', type: 'number', min: 200, max: 12000 }, { key: 'submissions', label: 'Submissions', type: 'number', min: 10, max: 900 }, { key: 'abandonment', label: 'Abandonment', type: 'percent', min: 20, max: 80 }] },
      { key: 'smart_page_surveys', label: 'Surveys', singular: 'Survey', prefix: 'SV-', titleField: 'title', statusField: 'status', dateField: 'date', seedCount: 8,
        fields: [{ key: 'title', label: 'Title', type: 'text', required: true, pool: ['Buyer Preferences 2026', 'Site Visit Feedback', 'Amenities Wishlist', 'Possession Experience', 'Brand Recall Survey'] }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, { key: 'responses', label: 'Responses', type: 'number', min: 5, max: 600 }, status(['Draft', 'Live', 'Closed'])] },
    ],
  },
  {
    key: 'google_analytics', label: 'Google Analytics', icon: 'BarChart3', group: 'Marketing',
    pages: [
      { key: 'analytics', label: 'Analytics', kind: 'dashboard' },
      { key: 'workspaces', label: 'Workspaces', kind: 'table', entity: 'google_analytics_workspaces' },
      { key: 'properties', label: 'Properties', kind: 'table', entity: 'google_analytics_properties' },
      { key: 'traffic', label: 'Traffic', kind: 'table', entity: 'google_analytics_traffic' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'defaultRange', label: 'Default date range', type: 'select', options: ['Last 7 days', 'Last 30 days', 'Last 90 days'] },
      { key: 'measurementId', label: 'Measurement ID', type: 'text', pool: ['G-STERLITEE1', 'G-STERLITEE2'] },
    ],
    entities: [
      workspaces('google_analytics'),
      { key: 'google_analytics_properties', label: 'Properties', singular: 'Property', titleField: 'name', seedCount: 6,
        fields: [name(['sterlitee.example', 'Regal Park Microsite', 'Villas Microsite', 'Plots Landing Page', 'NRI Portal']), { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'google_analytics_workspaces' }, { key: 'timezone', label: 'Time Zone', type: 'text', pool: ['Asia/Kolkata'] }] },
      { key: 'google_analytics_traffic', label: 'Traffic', singular: 'Traffic Row', titleField: 'channel', dateField: 'date', seedCount: 60,
        fields: [
          { key: 'date', label: 'Date', type: 'date', required: true, gen: 'recent' },
          { key: 'channel', label: 'Channel', type: 'select', options: CHANNELS, required: true },
          { key: 'sessions', label: 'Sessions', type: 'number', min: 40, max: 2500 },
          { key: 'users', label: 'Users', type: 'number', min: 30, max: 2000 },
          { key: 'conversions', label: 'Conversions', type: 'number', min: 0, max: 80 },
        ] },
    ],
  },
  {
    key: 'social_analytics', label: 'Social Analytics', icon: 'Share2', group: 'Marketing',
    pages: [
      { key: 'overview', label: 'Overview', kind: 'dashboard' },
      { key: 'workspaces', label: 'Workspaces', kind: 'table', entity: 'social_analytics_workspaces' },
      { key: 'accounts', label: 'Social Accounts', kind: 'table', entity: 'social_analytics_accounts' },
      { key: 'metrics', label: 'Post Metrics', kind: 'table', entity: 'social_analytics_metrics' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'refreshHours', label: 'Refresh interval (hours)', type: 'number', pool: ['6', '12', '24'], min: 1 },
      { key: 'primaryNetwork', label: 'Primary network', type: 'select', options: NETWORKS },
    ],
    entities: [
      workspaces('social_analytics'),
      { key: 'social_analytics_accounts', label: 'Social Accounts', singular: 'Social Account', titleField: 'handle', seedCount: 8,
        fields: [{ key: 'handle', label: 'Handle', type: 'text', required: true, pool: ['@sterlitee', '@sterlitee_villas', '@regalpark_blr', '@sterlitee_nri', '@sterliteedevelopers'] }, { key: 'network', label: 'Network', type: 'select', options: NETWORKS, required: true }, { key: 'workspace', label: 'Workspace', type: 'ref', ref: 'social_analytics_workspaces' }] },
      { key: 'social_analytics_metrics', label: 'Post Metrics', singular: 'Metric', titleField: 'network', dateField: 'date', seedCount: 60,
        fields: [
          { key: 'network', label: 'Network', type: 'select', options: NETWORKS, required: true },
          { key: 'date', label: 'Date', type: 'date', required: true, gen: 'recent' },
          { key: 'followers', label: 'Followers', type: 'number', min: 1500, max: 60000 },
          { key: 'reach', label: 'Reach', type: 'number', min: 200, max: 90000 },
          { key: 'engagement', label: 'Engagement', type: 'number', min: 10, max: 8000 },
        ] },
    ],
  },
  {
    key: 'reputation', label: 'Reputation', icon: 'Star', group: 'Marketing',
    pages: [
      { key: 'topics', label: 'Topics', kind: 'table', entity: 'reputation_topics' },
      { key: 'projects', label: 'Projects', kind: 'table', entity: 'reputation_projects' },
      { key: 'mentions', label: 'Mentions', kind: 'table', entity: 'reputation_mentions' },
      { key: 'summary', label: 'Summary', kind: 'dashboard' },
      { key: 'vendors', label: 'Vendors', kind: 'table', entity: 'reputation_vendors' },
      { key: 'accounts', label: 'Social Accounts', kind: 'table', entity: 'reputation_accounts' },
      { key: 'cases', label: 'Cases', kind: 'table', entity: 'reputation_cases' },
      { key: 'settings', label: 'Settings', kind: 'settings' },
    ],
    settings: [
      { key: 'alertOnNegative', label: 'Alert on negative mentions', type: 'checkbox' },
      { key: 'digestFrequency', label: 'Digest frequency', type: 'select', options: ['Daily', 'Weekly', 'Monthly'] },
    ],
    entities: [
      { key: 'reputation_topics', label: 'Topics', singular: 'Topic', titleField: 'name', seedCount: 6,
        fields: [name(['Sterlitee Developers', 'Regal Park', 'RERA Compliance', 'Possession Delays', 'Villa Phase 2', 'Construction Quality'])] },
      { key: 'reputation_projects', label: 'Projects', singular: 'Project', titleField: 'name', seedCount: 6,
        fields: [name(['Regal Park Residences', 'Sterlitee Villas Phase 2', 'Devanahalli Plots', 'Whitefield Heights', 'Sarjapur Greens']), { key: 'topic', label: 'Topic', type: 'ref', ref: 'reputation_topics' }] },
      { key: 'reputation_mentions', label: 'Mentions', singular: 'Mention', prefix: 'MEN-', titleField: 'text', statusField: 'sentiment', dateField: 'date', seedCount: 15,
        fields: [
          { key: 'text', label: 'Text', type: 'text', required: true, pool: ['Sterlitee delivers Regal Park ahead of RERA timeline', 'Buyers complain about delayed possession at Whitefield Heights', 'Great amenities at Sterlitee Villas, says homeowner', 'Sterlitee launches Phase 2 plots near Devanahalli', 'Mixed reviews on site visit experience', 'Sterlitee wins best township design award'] },
          { key: 'source', label: 'Source', type: 'select', options: ['Google News', 'YouTube', 'Facebook', 'Instagram'], required: true },
          { key: 'sentiment', label: 'Sentiment', type: 'select', options: ['Positive', 'Negative', 'Neutral'], required: true },
          { key: 'date', label: 'Date', type: 'date', gen: 'recent' },
          { key: 'project', label: 'Project', type: 'ref', ref: 'reputation_projects' },
        ] },
      { key: 'reputation_vendors', label: 'Vendors', singular: 'Vendor', titleField: 'name', seedCount: 6,
        fields: [name(['Google News', 'YouTube', 'Facebook', 'Instagram', 'X', 'Quora']), { key: 'status', label: 'Status', type: 'select', options: ['Connected', 'Disconnected'] }] },
      { key: 'reputation_accounts', label: 'Social Accounts', singular: 'Social Account', titleField: 'handle', seedCount: 6,
        fields: [{ key: 'handle', label: 'Handle', type: 'text', required: true, pool: ['@sterlitee', '@regalpark_blr', '@sterlitee_villas', '@sterlitee_nri'] }, { key: 'network', label: 'Network', type: 'select', options: ['Facebook', 'Instagram', 'YouTube', 'X'] }] },
      { key: 'reputation_cases', label: 'Cases', singular: 'Case', prefix: 'RC-', titleField: 'title', statusField: 'status', dateField: 'date', seedCount: 8,
        fields: [{ key: 'title', label: 'Title', type: 'text', required: true, pool: ['Respond to possession delay post', 'Fake review takedown request', 'Clarify RERA registration claim', 'Reply to site visit complaint', 'Press clarification - cement price'] }, { key: 'mention', label: 'Mention', type: 'ref', ref: 'reputation_mentions' }, { key: 'date', label: 'Date', type: 'date', gen: 'recent' }, status(['Open', 'In Progress', 'Resolved', 'Closed'])] },
      lookup('reputation_categories', 'Categories', 'Category', ['Brand', 'Project', 'Competitor', 'Regulatory', 'Customer Service', 'Press']),
    ],
  },
];
