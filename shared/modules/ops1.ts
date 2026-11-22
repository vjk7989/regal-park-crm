import type { EntityDef, FieldDef, ModuleDef } from '../registry';

const status = (options: string[]): FieldDef => ({ key: 'status', label: 'Status', type: 'select', options, required: true });
const sel = (key: string, label: string, options: string[], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'select', options, ...o });
const txt = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'text', ...o });
const num = (key: string, label: string, min: number, max: number, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'number', min, max, ...o });
const money = (key: string, label: string, min: number, max: number, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'money', min, max, ...o });
const date = (key: string, label: string, gen: 'past' | 'future' | 'recent', o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'date', gen, ...o });
const ref = (key: string, label: string, to: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: 'ref', ref: to, ...o });
const person = (key = 'name', label = 'Name'): FieldDef => ({ key, label, type: 'text', required: true, gen: 'person' });
const phone = (): FieldDef => ({ key: 'phone', label: 'Phone', type: 'tel', gen: 'phone' });
const email = (): FieldDef => ({ key: 'email', label: 'Email', type: 'email', gen: 'email' });
const flag = (key: string, label: string): FieldDef => ({ key, label, type: 'checkbox' });
const lookup = (key: string, label: string, singular: string, pool: string[]): EntityDef => ({
  key, label, singular, titleField: 'name', lookup: true, seedCount: Math.min(pool.length, 8),
  fields: [txt('name', 'Name', { required: true, pool })],
});
const pg = (key: string, label: string, entity: string) => ({ key, label, kind: 'table' as const, entity });
const dash = { key: 'dashboard', label: 'Dashboard', kind: 'dashboard' as const };
const settingsPage = { key: 'settings', label: 'Settings', kind: 'settings' as const };
const report = () => ({ key: 'report', label: 'Report', kind: 'report' as const });

const SERVICES = ['Plumbing leak repair', 'Electrical fault diagnosis', 'AC gas refill and servicing', 'Lift breakdown inspection', 'Seepage waterproofing touch-up', 'Water purifier servicing', 'Modular kitchen hinge repair', 'Geyser replacement'];
const PROJECTS = ['Regal Park', 'Sterlitee Greens', 'Lakeview Villas', 'Orchid Heights', 'Skyline Residency', 'Palm Meadows'];
const PRIORITY = ['Low', 'Medium', 'High', 'Urgent'];

const fieldService: ModuleDef = {
  key: 'field_service', label: 'Field Service', icon: 'Wrench', group: 'Operations',
  pages: [dash,
    pg('technicians', 'Technicians', 'field_service_technicians'), pg('crews', 'Crews', 'field_service_crews'),
    pg('equipment_assets', 'Equipment Assets', 'field_service_equipment_assets'), pg('customer_assets', 'Customer Assets', 'field_service_customer_assets'),
    pg('requests', 'Requests', 'field_service_requests'), pg('estimates', 'Estimates', 'field_service_estimates'),
    pg('work_orders', 'Work Orders', 'field_service_work_orders'), pg('service_appointments', 'Service Appointments', 'field_service_service_appointments'),
    pg('trips', 'Trips', 'field_service_trips'), pg('service_reports', 'Service Reports', 'field_service_service_reports'),
    pg('time_off', 'Time Off', 'field_service_time_off'),
    report(), settingsPage],
  settings: [
    { key: 'requestPrefix', label: 'Request number prefix', type: 'text', pool: ['SR-', 'REQ-'] },
    sel('defaultPriority', 'Default priority', PRIORITY),
    { key: 'responseSlaHours', label: 'Response SLA (hours)', type: 'number', pool: ['24', '12', '48'], min: 1 },
    flag('autoWorkOrder', 'Auto-create work order on approval'),
  ],
  entities: [
    lookup('field_service_skills', 'Skills', 'Skill', ['Plumbing', 'Electrical', 'HVAC', 'Lift Maintenance', 'Carpentry', 'Waterproofing']),
    lookup('field_service_categories', 'Service Categories', 'Service Category', ['Plumbing', 'Electrical', 'AC & Cooling', 'Lift', 'Civil Repairs', 'Appliances']),
    { key: 'field_service_technicians', label: 'Technicians', singular: 'Technician', prefix: 'TEC-', titleField: 'name', statusField: 'status', seedCount: 10,
      fields: [person(), phone(), email(), ref('skill', 'Skill', 'field_service_skills'), num('experience', 'Experience (yrs)', 1, 25), status(['Available', 'On Job', 'On Leave'])] },
    { key: 'field_service_crews', label: 'Crews', singular: 'Crew', prefix: 'CRW-', titleField: 'name', statusField: 'status', seedCount: 6,
      fields: [txt('name', 'Name', { required: true, pool: ['Plumbing Crew A', 'Electrical Crew B', 'HVAC Crew', 'Lift Service Team', 'Civil Repair Crew', 'Rapid Response Crew'] }),
        ref('lead', 'Lead', 'field_service_technicians'), num('size', 'Size', 2, 8), status(['Active', 'Inactive'])] },
    { key: 'field_service_equipment_assets', label: 'Equipment Assets', singular: 'Equipment Asset', prefix: 'EQ-', titleField: 'name', statusField: 'status', dateField: 'purchaseDate', amountField: 'cost', seedCount: 10,
      fields: [txt('name', 'Name', { required: true, pool: ['Pipe Inspection Camera', 'Hilti Rotary Hammer', 'Megger Insulation Tester', 'Pressure Test Pump', 'AC Vacuum Pump', 'Clamp Meter', 'Wet & Dry Vacuum'] }),
        { key: 'serial', label: 'Serial No.', type: 'text', gen: 'serial' }, txt('model', 'Model', { pool: ['HT-400', 'TE 30-C', 'MIT-525', 'PTP-60', 'VP-215', 'DT-3290'] }),
        date('purchaseDate', 'Purchase Date', 'past'), money('cost', 'Cost', 3000, 250000), date('warranty', 'Warranty Until', 'future'),
        status(['Operational', 'Repairing', 'Non-Operational', 'Pending'])] },
    { key: 'field_service_customer_assets', label: 'Customer Assets', singular: 'Customer Asset', prefix: 'CA-', titleField: 'name', statusField: 'status', dateField: 'warrantyExpiry', seedCount: 12,
      fields: [txt('name', 'Name', { required: true, pool: ['Split AC 1.5T', 'Passenger Lift', 'Solar Water Heater', 'Modular Kitchen Chimney', 'Home Inverter', 'Water Softener'] }),
        ref('client', 'Client', 'clients', { required: true }), txt('part', 'Part', { pool: ['Compressor', 'Control Panel', 'Heating Element', 'Motor', 'Battery', 'Filter Cartridge'] }),
        date('warrantyExpiry', 'Warranty Expiry', 'future'), status(['Under Warranty', 'Out of Warranty', 'AMC Active'])] },
    { key: 'field_service_requests', label: 'Requests', singular: 'Request', prefix: 'SR-', titleField: 'description', statusField: 'status', dateField: 'dueDate', seedCount: 14, kanban: true,
      fields: [txt('description', 'Description', { required: true, pool: SERVICES }), ref('client', 'Client', 'clients', { required: true }), sel('priority', 'Priority', PRIORITY),
        sel('source', 'Source', ['Phone', 'Email', 'Portal', 'Walk-in']), date('dueDate', 'Due Date', 'future'),
        status(['New', 'Approved', 'Rejected', 'Cancelled', 'Estimate Created', 'Work Order Created'])] },
    { key: 'field_service_estimates', label: 'Estimates', singular: 'Estimate', prefix: 'FSE-', titleField: 'title', statusField: 'status', dateField: 'date', amountField: 'total', seedCount: 10,
      fields: [txt('title', 'Title', { required: true, pool: SERVICES }), ref('client', 'Client', 'clients', { required: true }), ref('request', 'Request', 'field_service_requests'),
        date('date', 'Date', 'recent'), money('total', 'Total', 1500, 85000), status(['Draft', 'Sent', 'Accepted', 'Declined'])] },
    { key: 'field_service_work_orders', label: 'Work Orders', singular: 'Work Order', prefix: 'FWO-', titleField: 'title', statusField: 'status', dateField: 'date', amountField: 'total', seedCount: 14,
      fields: [txt('title', 'Title', { required: true, pool: SERVICES }), ref('client', 'Client', 'clients', { required: true }), sel('priority', 'Priority', PRIORITY),
        money('subtotal', 'Subtotal', 1200, 70000), money('tax', 'Tax', 100, 12600), money('total', 'Total', 1400, 82600), date('date', 'Date', 'recent'),
        status(['In Progress', 'Completed', 'Closed', 'Cancelled', 'Overdue'])] },
    { key: 'field_service_service_appointments', label: 'Service Appointments', singular: 'Service Appointment', prefix: 'FSA-', titleField: 'title', statusField: 'status', dateField: 'start', calendar: true, seedCount: 14,
      fields: [txt('title', 'Title', { required: true, pool: SERVICES }), ref('workOrder', 'Work Order', 'field_service_work_orders'), ref('crew', 'Crew', 'field_service_crews'),
        ref('technician', 'Technician', 'field_service_technicians'), date('start', 'Start', 'future', { required: true }), date('end', 'End', 'future'),
        status(['Scheduled', 'In Progress', 'Completed', 'Cancelled'])] },
    { key: 'field_service_trips', label: 'Trips', singular: 'Trip', prefix: 'TRP-', titleField: 'destination', statusField: 'status', dateField: 'date', seedCount: 10,
      fields: [txt('destination', 'Destination', { required: true, pool: PROJECTS }), ref('technician', 'Technician', 'field_service_technicians'), ref('workOrder', 'Work Order', 'field_service_work_orders'),
        date('date', 'Date', 'recent'), num('distanceKm', 'Distance (km)', 2, 60), status(['Planned', 'En Route', 'Completed'])] },
    { key: 'field_service_service_reports', label: 'Service Reports', singular: 'Service Report', prefix: 'RPT-', titleField: 'summary', statusField: 'status', dateField: 'date', seedCount: 10,
      fields: [txt('summary', 'Summary', { required: true, pool: ['Leak sealed and pressure tested', 'Compressor replaced, cooling restored', 'Lift controller reset and calibrated', 'MCB panel rewired', 'Waterproof membrane patched'] }),
        ref('workOrder', 'Work Order', 'field_service_work_orders', { required: true }), ref('technician', 'Technician', 'field_service_technicians'), date('date', 'Date', 'recent'),
        status(['Signed', 'Sent', 'Cancelled'])] },
    { key: 'field_service_time_off', label: 'Time Off', singular: 'Time Off', prefix: 'TO-', titleField: 'technician', statusField: 'status', dateField: 'start', seedCount: 8,
      fields: [ref('technician', 'Technician', 'field_service_technicians', { required: true }), sel('type', 'Type', ['Casual', 'Sick', 'Earned', 'Festival']),
        date('start', 'Start', 'future'), date('end', 'End', 'future'), status(['Pending', 'Approved', 'Rejected'])] },
  ],
};

const EQUIP = ['JCB 3DX Backhoe', 'Tower Crane 8T', 'Scaffolding Set (50 m)', 'Concrete Mixer 500L', 'Vibrator Needle', 'Diesel Generator 62kVA', 'Plate Compactor', 'Furnished Apartment Sofa Set', 'Queen Bed with Mattress', 'Dining Table 6-Seater'];

const rental: ModuleDef = {
  key: 'rental', label: 'Rental', icon: 'Boxes', group: 'Operations',
  pages: [dash, pg('products', 'Products', 'rental_products'), pg('orders', 'Rental Orders', 'rental_orders'), pg('maintenances', 'Maintenances', 'rental_maintenances'),
    pg('discounts', 'Discounts', 'rental_discounts'), report(), settingsPage],
  settings: [
    { key: 'orderPrefix', label: 'Order number prefix', type: 'text', pool: ['RO-', 'RNT-'] },
    { key: 'lateFeePercent', label: 'Late fee (% per day)', type: 'number', pool: ['2', '1', '3'], min: 0 },
    { key: 'securityDepositPercent', label: 'Security deposit (%)', type: 'number', pool: ['20', '10', '25'], min: 0 },
  ],
  entities: [
    lookup('rental_groups', 'Product Groups', 'Product Group', ['Construction Equipment', 'Scaffolding', 'Power Tools', 'Living Room Furniture', 'Bedroom Furniture', 'Appliances']),
    lookup('rental_maintenance_types', 'Maintenance Types', 'Maintenance Type', ['Routine Service', 'Breakdown Repair', 'Safety Inspection', 'Cleaning & Refurbish']),
    { key: 'rental_products', label: 'Products', singular: 'Product', prefix: 'RP-', titleField: 'name', seedCount: 12,
      fields: [txt('name', 'Name', { required: true, pool: EQUIP }), { key: 'sku', label: 'SKU', type: 'text', gen: 'serial' }, ref('group', 'Group', 'rental_groups'),
        money('salePrice', 'Sale Price', 5000, 2500000), money('purchasePrice', 'Purchase Price', 4000, 2000000), money('monthlyRate', 'Monthly Rate', 800, 90000)] },
    { key: 'rental_orders', label: 'Rental Orders', singular: 'Rental Order', prefix: 'RO-', titleField: 'product', statusField: 'status', dateField: 'from', amountField: 'total', seedCount: 14,
      fields: [ref('client', 'Client', 'clients', { required: true }), ref('product', 'Product', 'rental_products', { required: true }), date('from', 'From', 'recent', { required: true }), date('to', 'To', 'future'),
        money('tax', 'Tax', 200, 60000), money('total', 'Total', 2000, 400000),
        status(['Waiting for approval', 'Approved', 'Rejected', 'Finished', 'Return'])] },
    { key: 'rental_maintenances', label: 'Maintenances', singular: 'Maintenance', prefix: 'RM-', titleField: 'product', statusField: 'status', dateField: 'date', amountField: 'cost', seedCount: 10,
      fields: [ref('product', 'Product', 'rental_products', { required: true }), ref('type', 'Type', 'rental_maintenance_types'), date('date', 'Date', 'recent'),
        txt('vendor', 'Vendor', { pool: ['Sri Sai Machinery Works', 'Bharat Equipment Care', 'Peenya Tool Services', 'Kumar Furniture Refurb'] }), money('cost', 'Cost', 500, 60000),
        status(['Scheduled', 'In Progress', 'Completed'])] },
    { key: 'rental_discounts', label: 'Discounts', singular: 'Discount', titleField: 'name', statusField: 'status', amountField: 'minOrder', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Long-term site rental', 'Festive furnishing offer', 'Repeat contractor', 'Corporate housing', 'Early return bonus', 'Monsoon special'] }),
        { key: 'percent', label: 'Discount %', type: 'percent', min: 1, max: 25 }, money('minOrder', 'Min Order', 5000, 100000), date('validTill', 'Valid Till', 'future'),
        status(['Active', 'Expired'])] },
  ],
};

const SITES = ['Sterlitee Greens - Devanahalli', 'Regal Park - Whitefield', 'Lakeview Villas - Sarjapur', 'Orchid Heights - Hebbal', 'Skyline Residency - Electronic City', 'Palm Meadows - Yelahanka'];
const CITIES = ['Dubai', 'Abu Dhabi', 'Singapore', 'London', 'New Jersey', 'Doha', 'Sydney'];
const MATERIALS = ['TMT steel bars (8 tonne)', 'Cement bags (400 nos)', 'Vitrified tiles pallets', 'Modular kitchen carcasses', 'Sanitary ware crates', 'Electrical cable drums', 'Sale deed originals', 'Possession kit documents'];

const logistic: ModuleDef = {
  key: 'logistic', label: 'Logistic', icon: 'Truck', group: 'Operations',
  pages: [dash, pg('recipients', 'Recipients', 'logistic_recipients'), pg('pre_alerts', 'Pre-Alerts', 'logistic_pre_alerts'),
    pg('locker_packages', 'Locker Packages', 'logistic_locker_packages'), pg('shipments', 'Shipments', 'logistic_shipments'),
    pg('pickups', 'Pickups', 'logistic_pickups'), pg('consolidated', 'Consolidated', 'logistic_consolidated'), report(), settingsPage],
  settings: [
    { key: 'trackingPrefix', label: 'Tracking prefix', type: 'text', pool: ['STL', 'SDL'] },
    sel('defaultCarrier', 'Default carrier', ['Blue Dart', 'DTDC', 'Delhivery', 'Professional Couriers']),
    { key: 'fuelSurchargePercent', label: 'Fuel surcharge (%)', type: 'number', pool: ['8', '10', '12'], min: 0 },
  ],
  entities: [
    lookup('logistic_carriers', 'Carriers', 'Carrier', ['Blue Dart', 'DTDC', 'Delhivery', 'Professional Couriers', 'VRL Logistics', 'Gati']),
    lookup('logistic_package_types', 'Package Types', 'Package Type', ['Document Envelope', 'Carton Box', 'Pallet', 'Crate', 'Drum']),
    { key: 'logistic_recipients', label: 'Recipients', singular: 'Recipient', prefix: 'RCP-', titleField: 'name', seedCount: 10,
      fields: [person(), phone(), email(), { key: 'address', label: 'Address', type: 'text', gen: 'address' }, txt('city', 'City', { pool: [...CITIES, 'Bengaluru', 'Mysuru'] })] },
    { key: 'logistic_pre_alerts', label: 'Pre-Alerts', singular: 'Pre-Alert', prefix: 'PA-', titleField: 'description', statusField: 'status', dateField: 'expected', seedCount: 10,
      fields: [txt('description', 'Description', { required: true, pool: MATERIALS }), ref('recipient', 'Recipient', 'logistic_recipients'), ref('carrier', 'Carrier', 'logistic_carriers'),
        { key: 'trackingNo', label: 'Tracking No.', type: 'text', gen: 'serial' }, date('expected', 'Expected', 'future'), status(['Announced', 'Received', 'Cancelled'])] },
    { key: 'logistic_locker_packages', label: 'Locker Packages', singular: 'Locker Package', prefix: 'LP-', titleField: 'lockerNo', statusField: 'status', dateField: 'received', seedCount: 10,
      fields: [{ key: 'lockerNo', label: 'Locker No.', type: 'text', required: true, gen: 'serial' }, ref('recipient', 'Recipient', 'logistic_recipients'), ref('type', 'Package Type', 'logistic_package_types'),
        num('weightKg', 'Weight (kg)', 1, 120), date('received', 'Received', 'recent'), status(['Stored', 'Ready for Pickup', 'Collected'])] },
    { key: 'logistic_shipments', label: 'Shipments', singular: 'Shipment', prefix: 'SHP-', titleField: 'tracking', statusField: 'status', dateField: 'date', amountField: 'totalCost', seedCount: 14, kanban: true,
      fields: [{ key: 'tracking', label: 'Tracking', type: 'text', required: true, gen: 'serial' }, date('date', 'Date', 'recent'), ref('client', 'Client', 'clients'), ref('recipient', 'Recipient', 'logistic_recipients'),
        txt('origin', 'Origin', { pool: ['Peenya Warehouse, Bengaluru', 'Sterlitee HO, MG Road', 'Hoskote Yard'] }), txt('destination', 'Destination', { pool: [...SITES, ...CITIES] }),
        sel('payment', 'Payment', ['Prepaid', 'To Pay', 'Credit']), money('totalCost', 'Total Cost', 400, 120000), status(['Quotation', 'Picked up', 'Pending', 'Invoiced', 'Delivered'])] },
    { key: 'logistic_pickups', label: 'Pickups', singular: 'Pickup', prefix: 'PK-', titleField: 'location', statusField: 'status', dateField: 'date', seedCount: 10,
      fields: [txt('location', 'Location', { required: true, pool: SITES }), date('date', 'Date', 'future'), txt('contact', 'Contact', { gen: 'person' }), phone(), ref('carrier', 'Carrier', 'logistic_carriers'),
        status(['Requested', 'Scheduled', 'Picked up', 'Cancelled'])] },
    { key: 'logistic_consolidated', label: 'Consolidated', singular: 'Consolidated Shipment', prefix: 'CS-', titleField: 'name', statusField: 'status', dateField: 'date', amountField: 'totalCost', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Dubai NRI document batch', 'Site 3 steel consignment', 'Kitchen hardware batch', 'Singapore buyer documents', 'Tile mixed load', 'UK NRI possession kits'] }),
        num('packages', 'Packages', 2, 40), date('date', 'Date', 'recent'), money('totalCost', 'Total Cost', 2000, 250000), status(['Open', 'In Transit', 'Delivered'])] },
  ],
};

const appointments: ModuleDef = {
  key: 'appointments', label: 'Appointment Booking', icon: 'Calendar', group: 'Operations',
  pages: [dash, pg('workspaces', 'Workspaces', 'appointments_workspaces'), pg('resources', 'Resources', 'appointments_resources'),
    pg('event_types', 'Event Types', 'appointments_event_types'), pg('appointments', 'Appointments', 'appointments_appointments'), settingsPage],
  settings: [
    { key: 'bookingPrefix', label: 'Booking ID prefix', type: 'text', pool: ['APT-', 'BKG-'] },
    { key: 'slotMinutes', label: 'Slot length (minutes)', type: 'number', pool: ['30', '45', '60'], min: 5 },
    flag('allowReschedule', 'Allow customer reschedule'),
  ],
  entities: [
    lookup('appointments_locations', 'Locations', 'Location', ['Experience Centre - MG Road', 'Site Office - Devanahalli', 'Loan Desk - HO', 'Regal Park Model Flat', 'Whitefield Sales Gallery']),
    { key: 'appointments_workspaces', label: 'Workspaces', singular: 'Workspace', titleField: 'name', seedCount: 6,
      fields: [txt('name', 'Name', { required: true, pool: ['Site Visits', 'Experience Centre', 'Loan Desk', 'Registration Desk', 'Interior Studio', 'NRI Desk'] }), ref('location', 'Location', 'appointments_locations'), txt('manager', 'Manager', { gen: 'person' })] },
    { key: 'appointments_resources', label: 'Resources', singular: 'Resource', titleField: 'name', seedCount: 10,
      fields: [txt('name', 'Name', { required: true, pool: ['Model Flat A', 'Model Flat B', 'Walkthrough Cab 1', 'Meeting Room 1', 'Meeting Room 2', 'VR Theatre', 'Loan Counter 3'] }), ref('workspace', 'Workspace', 'appointments_workspaces'), flag('active', 'Active')] },
    { key: 'appointments_event_types', label: 'Event Types', singular: 'Event Type', titleField: 'name', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Site visit', 'Experience centre walkthrough', 'Home loan consultation', 'Interior design consult', 'Registration slot', 'NRI video call'] }),
        sel('type', 'Type', ['Group', 'Collective', 'Resource Booking']), num('duration', 'Duration (min)', 15, 180), flag('active', 'Active')] },
    { key: 'appointments_appointments', label: 'Appointments', singular: 'Appointment', prefix: 'APT-', titleField: 'eventType', statusField: 'status', dateField: 'time', amountField: 'price', calendar: true, seedCount: 16,
      fields: [ref('eventType', 'Event Type', 'appointments_event_types', { required: true }), date('time', 'Time', 'future', { required: true }), ref('resource', 'Resource', 'appointments_resources'),
        ref('staff', 'Staff', 'staff'), ref('client', 'Client', 'clients'), ref('lead', 'Lead', 'leads', { list: false }), sel('paymentStatus', 'Payment', ['Unpaid', 'Paid', 'Partially Paid']),
        money('price', 'Price', 0, 5000), status(['Upcoming', 'Completed', 'Cancel', 'Not Show'])] },
  ],
};

const workflow: ModuleDef = {
  key: 'workflow', label: 'Workflow Automation', icon: 'Workflow', group: 'Operations',
  pages: [pg('workflows', 'Workflows', 'workflow_workflows'), pg('histories', 'Histories', 'workflow_histories'), settingsPage],
  settings: [
    flag('retryFailed', 'Retry failed runs'),
    { key: 'maxRetries', label: 'Max retries', type: 'number', pool: ['3', '1', '5'], min: 0 },
    sel('defaultCategory', 'Default category', ['Leads', 'Bookings', 'Payments', 'Possession']),
  ],
  entities: [
    lookup('workflow_task_templates', 'Task Templates', 'Task Template', ['Call lead within 1 hour', 'Send booking confirmation', 'Payment reminder', 'Collect KYC documents', 'Schedule snagging inspection', 'Handover keys']),
    { key: 'workflow_workflows', label: 'Workflows', singular: 'Workflow', titleField: 'name', dateField: 'created', seedCount: 10,
      fields: [txt('name', 'Name', { required: true, pool: ['New lead auto-assign', 'Booking welcome kit', 'Payment due reminder', 'Possession checklist', 'Site visit follow-up', 'Demand letter dispatch', 'Cheque bounce alert'] }),
        ref('owner', 'Owner', 'users'), sel('category', 'Category', ['Leads', 'Bookings', 'Payments', 'Possession']), date('created', 'Created', 'past'), flag('enabled', 'Enabled')] },
    { key: 'workflow_histories', label: 'Histories', singular: 'History', titleField: 'action', statusField: 'result', dateField: 'dateTime', seedCount: 15,
      fields: [{ key: 'dateTime', label: 'Date & Time', type: 'date', gen: 'recent' }, ref('workflow', 'Workflow', 'workflow_workflows', { required: true }),
        txt('node', 'Node', { pool: ['Trigger', 'Condition', 'Send SMS', 'Send Email', 'Create Task', 'Assign Agent'] }), sel('relationType', 'Relation Type', ['Lead', 'Booking', 'Payment', 'Possession']),
        ref('relatedTo', 'Related To', 'leads'), txt('action', 'Action', { required: true, pool: ['Assigned to sales agent', 'Sent confirmation SMS', 'Created follow-up task', 'Emailed demand letter', 'Sent reminder'] }),
        { key: 'result', label: 'Result', type: 'select', options: ['Success', 'Failed'], required: true }] },
  ],
};

const dc: ModuleDef = {
  key: 'digital_contracts', label: 'Digital Contracts', icon: 'FileSignature', group: 'Operations',
  pages: [dash, pg('vendors', 'Vendors', 'digital_contracts_vendors'), pg('clause_libraries', 'Clause Libraries', 'digital_contracts_clause_libraries'),
    pg('contract_types', 'Contract Types', 'digital_contracts_contract_types'), pg('contracts', 'Contracts', 'digital_contracts_contracts'),
    pg('addendums', 'Addendum', 'digital_contracts_addendums'), report(), settingsPage],
  settings: [
    { key: 'contractPrefix', label: 'Contract number prefix', type: 'text', pool: ['CTR-', 'AGR-'] },
    { key: 'expiryAlertDays', label: 'Expiry alert (days)', type: 'number', pool: ['30', '15', '60'], min: 0 },
    flag('requireESign', 'Require e-signature'),
  ],
  entities: [
    lookup('digital_contracts_categories', 'Contract Categories', 'Contract Category', ['Construction', 'Supply', 'Consultancy', 'Legal', 'Channel Partner', 'Facility Management']),
    { key: 'digital_contracts_vendors', label: 'Vendors', singular: 'Vendor', prefix: 'VND-', titleField: 'company', seedCount: 10,
      fields: [{ key: 'company', label: 'Company', type: 'text', required: true, gen: 'company' }, txt('contact', 'Contact', { gen: 'person' }), email(), phone(),
        ref('category', 'Category', 'digital_contracts_categories'), flag('active', 'Active')] },
    { key: 'digital_contracts_clause_libraries', label: 'Clause Libraries', singular: 'Clause', titleField: 'name', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Defect liability period', 'Delay penalty', 'RERA compliance', 'Force majeure', 'Payment milestones', 'Arbitration (Bengaluru)', 'Confidentiality'] }),
        sel('clauseType', 'Clause Type', ['Commercial', 'Legal', 'Compliance', 'Operational']), { key: 'text', label: 'Text', type: 'textarea', list: false, gen: 'paragraph' }] },
    { key: 'digital_contracts_contract_types', label: 'Contract Types', singular: 'Contract Type', titleField: 'name', statusField: 'status', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Civil works contract', 'Material supply agreement', 'Architect appointment', 'Channel partner agreement', 'Lease deed', 'AMC agreement'] }),
        ref('category', 'Category', 'digital_contracts_categories'), sel('approvalFlow', 'Approval Flow', ['Legal > Finance > MD', 'Legal > MD', 'Project Head > Finance']), status(['Active', 'Inactive'])] },
    { key: 'digital_contracts_contracts', label: 'Contracts', singular: 'Contract', prefix: 'CTR-', titleField: 'title', statusField: 'status', dateField: 'expiration', amountField: 'value', seedCount: 14,
      fields: [txt('title', 'Title', { required: true, pool: ['Tower B civil works', 'Cement supply - FY27', 'Landscape design - Palm Meadows', 'Channel partner - Prestige Realty', 'Lift AMC - Orchid Heights', 'Electrical works - Phase 2'] }),
        ref('type', 'Type', 'digital_contracts_contract_types'), ref('counterparty', 'Counterparty', 'digital_contracts_vendors'), money('value', 'Value', 100000, 90000000),
        date('effective', 'Effective', 'past'), date('expiration', 'Expiration', 'future'), sel('approval', 'Approval', ['Pending', 'Approved', 'Rejected']),
        status(['Draft', 'Pending Approval', 'Approved', 'Signed', 'Expired'])] },
    { key: 'digital_contracts_addendums', label: 'Addendum', singular: 'Addendum', prefix: 'ADD-', titleField: 'title', statusField: 'status', dateField: 'date', amountField: 'value', seedCount: 8,
      fields: [txt('title', 'Title', { required: true, pool: ['Scope extension', 'Price escalation', 'Timeline revision', 'Added warranty clause', 'Payment term change'] }),
        ref('contract', 'Contract', 'digital_contracts_contracts', { required: true }), date('date', 'Date', 'recent'), money('value', 'Value', 10000, 5000000), status(['Draft', 'Approved', 'Signed'])] },
  ],
};

const DESIGNS = ['Modular L-shaped kitchen', 'Sliding wardrobe 8ft', 'Walk-in wardrobe', 'TV unit with storage', 'Crockery unit', 'Shoe rack cabinet', 'Island kitchen counter', 'Study table with overhead'];

const plm: ModuleDef = {
  key: 'plm', label: 'Product Lifecycle', icon: 'Boxes', group: 'Operations',
  pages: [dash, pg('types', 'Types', 'plm_types'), pg('products', 'Products', 'plm_products'), pg('work_centers', 'Work Centers', 'plm_work_centers'),
    pg('routings', 'Routings', 'plm_routings'), pg('boms', 'BOMs', 'plm_boms'), pg('ecos', 'ECOs', 'plm_ecos'), pg('stages', 'Stages', 'plm_stages'), settingsPage],
  settings: [
    { key: 'ecoPrefix', label: 'ECO number prefix', type: 'text', pool: ['ECO-', 'CHG-'] },
    flag('requireApproval', 'Require ECO approval'),
    sel('defaultApplyOn', 'Default apply on', ['BOM', 'Routing', 'BOM & Routing']),
  ],
  entities: [
    lookup('plm_materials', 'Materials', 'Material', ['BWP Plywood 18mm', 'HDHMR Board', 'Acrylic Laminate', 'Soft-close Hinge', 'Telescopic Channel', 'Aluminium Profile']),
    { key: 'plm_types', label: 'Types', singular: 'Type', titleField: 'name', seedCount: 6,
      fields: [txt('name', 'Name', { required: true, pool: ['Kitchen', 'Wardrobe', 'Storage Unit', 'Entertainment Unit', 'Study Furniture', 'Vanity'] }), txt('description', 'Description', { gen: 'sentence' })] },
    { key: 'plm_products', label: 'Products', singular: 'Product', prefix: 'PP-', titleField: 'name', statusField: 'status', amountField: 'cost', seedCount: 12,
      fields: [txt('name', 'Name', { required: true, pool: DESIGNS }), ref('type', 'Type', 'plm_types'), ref('material', 'Main Material', 'plm_materials'), money('cost', 'Cost', 8000, 350000),
        txt('version', 'Version', { pool: ['v1.0', 'v1.1', 'v2.0', 'v2.1', 'v3.0'] }), status(['Draft', 'In Design', 'Released', 'Obsolete'])] },
    { key: 'plm_work_centers', label: 'Work Centers', singular: 'Work Center', titleField: 'name', statusField: 'status', seedCount: 6,
      fields: [txt('name', 'Name', { required: true, pool: ['Panel Cutting', 'Edge Banding', 'CNC Routing', 'Assembly Bay', 'Finishing & Polish', 'Packing'] }), num('capacity', 'Capacity / day', 1, 60), money('hourlyCost', 'Cost / hour', 200, 2500), status(['Active', 'Inactive'])] },
    { key: 'plm_routings', label: 'Routings', singular: 'Routing', titleField: 'name', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Kitchen carcass routing', 'Wardrobe shutter routing', 'Panel finishing routing', 'Full assembly routing'] }), ref('workCenter', 'Work Center', 'plm_work_centers'), num('minutes', 'Duration (min)', 10, 480), num('sequence', 'Sequence', 1, 8)] },
    { key: 'plm_boms', label: 'BOMs', singular: 'BOM', prefix: 'BOM-', titleField: 'product', seedCount: 10,
      fields: [ref('product', 'Product', 'plm_products', { required: true }), ref('material', 'Material', 'plm_materials'), num('quantity', 'Quantity', 1, 40), sel('unit', 'Unit', ['pcs', 'sheet', 'm', 'kg', 'set']), txt('version', 'Version', { pool: ['v1.0', 'v1.1', 'v2.0'] })] },
    { key: 'plm_stages', label: 'Stages', singular: 'Stage', titleField: 'name', seedCount: 5,
      fields: [txt('name', 'Name', { required: true, pool: ['New', 'Design Review', 'Prototype', 'Approved', 'Released'] }), num('sequence', 'Sequence', 1, 10), flag('final', 'Final stage')] },
    { key: 'plm_ecos', label: 'ECOs', singular: 'ECO', prefix: 'ECO-', titleField: 'name', statusField: 'status', seedCount: 12, kanban: true,
      fields: [txt('name', 'Name', { required: true, pool: ['Switch to soft-close hinges', 'Replace plywood with HDHMR', 'Change shutter dimension', 'Add drawer organiser', 'Revise edge-band spec', 'Update routing sequence'] }),
        sel('ecoType', 'ECO Type', ['Product', 'Bill of Materials', 'Process']), sel('applyOn', 'Apply On', ['BOM', 'Routing', 'BOM & Routing']), sel('priority', 'Priority', ['Low', 'Normal', 'High']),
        ref('responsible', 'Responsible', 'users'), status(['In Progress', 'Pending Version Change', 'Done', 'Canceled'])] },
  ],
};

const FACTORY = ['Precast boundary wall panel', 'Hardwood door frame 7ft', 'Modular kitchen base unit', 'Precast manhole cover', 'Staircase railing set', 'Wardrobe carcass 6ft', 'Window frame teak'];

const manufacturing: ModuleDef = {
  key: 'manufacturing', label: 'Manufacturing', icon: 'Factory', group: 'Operations',
  pages: [dash, pg('products', 'Products', 'manufacturing_products'), pg('boms', 'Bills of Materials', 'manufacturing_boms'), pg('routings', 'Routings', 'manufacturing_routings'),
    pg('work_centers', 'Work Centers', 'manufacturing_work_centers'), pg('manufacturing_orders', 'Manufacturing Orders', 'manufacturing_orders'),
    pg('work_orders', 'Work Orders', 'manufacturing_work_orders'), settingsPage],
  settings: [
    { key: 'moPrefix', label: 'MO reference prefix', type: 'text', pool: ['MO-', 'MFG-'] },
    { key: 'scrapPercent', label: 'Default scrap allowance (%)', type: 'number', pool: ['3', '2', '5'], min: 0 },
    flag('autoConfirm', 'Auto-confirm planned orders'),
  ],
  entities: [
    lookup('manufacturing_units', 'Units', 'Unit', ['pcs', 'sq.ft', 'running ft', 'kg', 'set', 'cubic m']),
    { key: 'manufacturing_products', label: 'Products', singular: 'Product', prefix: 'MP-', titleField: 'name', seedCount: 10,
      fields: [txt('name', 'Name', { required: true, pool: FACTORY }), { key: 'sku', label: 'SKU', type: 'text', gen: 'serial' }, ref('unit', 'Unit', 'manufacturing_units'), money('cost', 'Cost', 500, 90000), money('price', 'Sale Price', 700, 130000)] },
    { key: 'manufacturing_boms', label: 'Bills of Materials', singular: 'Bill of Materials', prefix: 'BM-', titleField: 'product', seedCount: 10,
      fields: [ref('product', 'Product', 'manufacturing_products', { required: true }), txt('component', 'Component', { pool: ['M30 concrete mix', 'TMT 8mm bars', 'Seasoned teak', 'BWP plywood', 'Laminate sheet', 'Hinges & handles'] }), num('quantity', 'Quantity', 1, 60), ref('unit', 'Unit', 'manufacturing_units')] },
    { key: 'manufacturing_work_centers', label: 'Work Centers', singular: 'Work Center', titleField: 'name', statusField: 'status', seedCount: 6,
      fields: [txt('name', 'Name', { required: true, pool: ['Casting Yard', 'Curing Bay', 'Carpentry Shop', 'CNC Section', 'Polishing Unit', 'Dispatch Dock'] }), num('capacity', 'Capacity / day', 1, 80), money('hourlyCost', 'Cost / hour', 200, 3000), status(['Active', 'Maintenance'])] },
    { key: 'manufacturing_routings', label: 'Routings', singular: 'Routing', titleField: 'name', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Precast casting routing', 'Door frame routing', 'Kitchen unit routing', 'Wardrobe routing'] }), ref('product', 'Product', 'manufacturing_products'), ref('workCenter', 'Work Center', 'manufacturing_work_centers'), num('minutes', 'Duration (min)', 15, 720)] },
    { key: 'manufacturing_orders', label: 'Manufacturing Orders', singular: 'Manufacturing Order', prefix: 'MO-', titleField: 'product', statusField: 'status', dateField: 'date', seedCount: 14, kanban: true,
      fields: [ref('product', 'Product', 'manufacturing_products', { required: true }), ref('bom', 'BOM', 'manufacturing_boms'), num('qty', 'Quantity', 1, 500), ref('unit', 'Unit', 'manufacturing_units'),
        ref('routing', 'Routing', 'manufacturing_routings'), date('date', 'Scheduled', 'recent'), status(['Planned', 'Confirmed', 'In progress', 'Done', 'Canceled'])] },
    { key: 'manufacturing_work_orders', label: 'Work Orders', singular: 'Work Order', prefix: 'MWO-', titleField: 'workOrder', statusField: 'status', dateField: 'scheduledStart', seedCount: 14,
      fields: [txt('workOrder', 'Work Order', { required: true, pool: ['Cast panels', 'Cure and demould', 'Cut frames', 'Assemble carcass', 'Polish and finish', 'Pack and dispatch'] }),
        date('scheduledStart', 'Scheduled Start', 'future'), ref('workCenter', 'Work Center', 'manufacturing_work_centers'), ref('mo', 'MO', 'manufacturing_orders'), ref('product', 'Product', 'manufacturing_products'),
        num('qty', 'Quantity', 1, 300), status(['Ready', 'Processing', 'Pause', 'Finished'])] },
  ],
};

const CHECK_ITEMS = ['M25 concrete', 'Terrace slab', 'CPVC lines', 'Vitrified flooring', 'Earth pit', 'Column rebar'];
const CHECK_OPS = ['Casting', 'Curing', 'Waterproofing', 'Plumbing', 'Flooring', 'Electrical'];
const CHECK_TYPES = ['Instructions', 'Take a Picture', 'Pass-Fail', 'Measure'];

const quality: ModuleDef = {
  key: 'quality', label: 'Quality', icon: 'ClipboardCheck', group: 'Operations',
  pages: [dash, pg('control_points', 'Control Points', 'quality_control_points'), pg('checks', 'Checks', 'quality_checks'), pg('alerts', 'Alerts', 'quality_alerts'),
    pg('failure_locations', 'Failure Locations', 'quality_failure_locations'), settingsPage],
  settings: [
    { key: 'checkPrefix', label: 'Check code prefix', type: 'text', pool: ['QC-', 'CHK-'] },
    sel('defaultCheckType', 'Default check type', CHECK_TYPES),
    flag('photoMandatory', 'Photo mandatory on failure'),
  ],
  entities: [
    lookup('quality_teams', 'Quality Teams', 'Quality Team', ['Civil QA', 'MEP QA', 'Finishing QA', 'Safety Team', 'Lab Testing']),
    { key: 'quality_control_points', label: 'Control Points', singular: 'Control Point', prefix: 'CP-', titleField: 'name', seedCount: 10,
      fields: [txt('name', 'Name', { required: true, pool: ['Concrete cube test - 7 day', 'Concrete cube test - 28 day', 'Terrace waterproofing ponding', 'Plumbing pressure test', 'Tile hollow sound check', 'Electrical earthing resistance', 'Rebar cover check'] }),
        txt('item', 'Item', { pool: CHECK_ITEMS }), txt('operation', 'Operation', { pool: CHECK_OPS }), sel('type', 'Type', CHECK_TYPES), ref('team', 'Team', 'quality_teams')] },
    { key: 'quality_checks', label: 'Checks', singular: 'Check', prefix: 'QC-', titleField: 'name', statusField: 'status', seedCount: 14,
      fields: [txt('name', 'Name', { required: true, pool: ['Cube test - Tower A slab 5', 'Ponding test - Block C terrace', 'Pressure test - Wing B risers', 'Tile check - Villa 12', 'Earthing check - Substation', 'Cover check - Podium columns'] }),
        ref('controlPoint', 'Control Point', 'quality_control_points'), txt('item', 'Item', { pool: CHECK_ITEMS }), txt('operation', 'Operation', { pool: CHECK_OPS }),
        sel('type', 'Type', CHECK_TYPES), ref('team', 'Team', 'quality_teams'), status(['Draft', 'To Do', 'Completed', 'Cancelled'])] },
    { key: 'quality_failure_locations', label: 'Failure Locations', singular: 'Failure Location', titleField: 'name', seedCount: 8,
      fields: [txt('name', 'Name', { required: true, pool: ['Tower A - Slab 5', 'Block C - Terrace', 'Wing B - Riser 3', 'Villa 12 - Master Bath', 'Podium - Column C7', 'Basement - Ramp'] }), txt('description', 'Description', { gen: 'sentence' })] },
    { key: 'quality_alerts', label: 'Alerts', singular: 'Alert', prefix: 'QA-', titleField: 'name', statusField: 'status', seedCount: 12, kanban: true,
      fields: [txt('name', 'Name', { required: true, pool: ['Cube strength below target', 'Terrace seepage after ponding', 'Pipe joint leakage', 'Hollow tiles found', 'Earth resistance high', 'Honeycombing in column'] }),
        txt('item', 'Item', { pool: CHECK_ITEMS }), txt('rootCause', 'Root Cause', { pool: ['Poor curing', 'Incorrect w/c ratio', 'Improper solvent cement', 'Insufficient adhesive', 'Dry earth pit', 'Inadequate vibration'] }),
        sel('priority', 'Priority', ['Low', 'Medium', 'High', 'Critical']), txt('correctiveAction', 'Corrective Action', { pool: ['Re-cure and retest', 'Reapply membrane', 'Replace joint', 'Re-lay tiles', 'Add earth electrode', 'Grout and repair'] }),
        ref('location', 'Location', 'quality_failure_locations', { list: false }), status(['New', 'Verified', 'Action Proposed', 'Resolved'])] },
  ],
};

export const MODULES: ModuleDef[] = [fieldService, rental, logistic, appointments, workflow, dc, plm, manufacturing, quality];
