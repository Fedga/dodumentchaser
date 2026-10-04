import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSchema, Firm, User, Client, DocumentRequest, DocumentRequirement, DocumentFile, Reminder, Template, ActivityLog, Session, RecurringSchedule } from './types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'documentchaser.json');

export class StorageEngine {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(content);

        // Ensure all schema collections exist
        parsed.sessions = parsed.sessions || [];
        parsed.firms = parsed.firms || [];
        parsed.users = parsed.users || [];
        parsed.clients = parsed.clients || [];
        parsed.requests = parsed.requests || [];
        parsed.requirements = parsed.requirements || [];
        parsed.documents = parsed.documents || [];
        parsed.reminders = parsed.reminders || [];
        parsed.templates = parsed.templates || [];
        parsed.recurringSchedules = parsed.recurringSchedules || [];
        parsed.activityLogs = parsed.activityLogs || [];

        // Check if Firm B (Apex Chartered Accountants) exists for cross-tenant testing; if not, seed it
        if (!parsed.firms.some((f: Firm) => f.id === 'firm_apex_02')) {
          this.seedFirmB(parsed);
          this.saveDatabase(parsed);
        }

        // Ensure default test sessions exist
        this.ensureDefaultSessions(parsed);

        // Ensure request portal token hashes, expiration, and revocation status exist
        this.ensureRequestPortalTokenHashes(parsed);

        // Ensure sample recurring schedules exist
        this.ensureRecurringSchedules(parsed);
        this.saveDatabase(parsed);

        return parsed;
      }
    } catch (err) {
      console.error('Failed to load database file, initializing with fresh demo data:', err);
    }

    const initial = this.generateInitialDemoData();
    this.saveDatabase(initial);
    return initial;
  }

  private saveDatabase(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = dataToSave || this.data;
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to persist database:', err);
    }
  }

  public getData(): DatabaseSchema {
    return this.data;
  }

  public commit() {
    this.saveDatabase();
  }

  private ensureDefaultSessions(data: DatabaseSchema) {
    data.sessions = data.sessions || [];
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const defaultSessions = [
      {
        id: 'sess_sarah_default',
        token: 'token_sarah_admin_firm_a',
        userId: 'user_sarah_01',
        firmId: 'firm_example_01',
        createdAt: '2026-01-15T09:00:00.000Z',
        expiresAt: oneYearFromNow,
      },
      {
        id: 'sess_alex_default',
        token: 'token_alex_staff_firm_a',
        userId: 'user_alex_02',
        firmId: 'firm_example_01',
        createdAt: '2026-01-15T09:00:00.000Z',
        expiresAt: oneYearFromNow,
      },
      {
        id: 'sess_james_default',
        token: 'token_james_admin_firm_b',
        userId: 'user_james_03',
        firmId: 'firm_apex_02',
        createdAt: '2026-01-15T09:00:00.000Z',
        expiresAt: oneYearFromNow,
      },
    ];

    for (const ds of defaultSessions) {
      if (!data.sessions.some(s => s.token === ds.token)) {
        data.sessions.push(ds);
      }
    }
  }

  private ensureRequestPortalTokenHashes(data: DatabaseSchema) {
    const defaultExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    for (const req of data.requests) {
      if (req.portalToken && !req.portalTokenHash) {
        req.portalTokenHash = crypto.createHash('sha256').update(req.portalToken.trim()).digest('hex');
      }
      if (!req.portalTokenExpiresAt) {
        req.portalTokenExpiresAt = defaultExpiry;
      }
      if (req.portalTokenRevoked === undefined) {
        req.portalTokenRevoked = false;
      }
    }
  }

  private ensureRecurringSchedules(data: DatabaseSchema) {
    data.recurringSchedules = data.recurringSchedules || [];

    // Ensure schedules have correct firmId
    for (const s of data.recurringSchedules) {
      if (s.firmId === 'firm_premier_01') s.firmId = 'firm_example_01';
    }
    for (const r of data.requests) {
      if (r.firmId === 'firm_premier_01') r.firmId = 'firm_example_01';
    }

    if (!data.recurringSchedules.some(s => s.id === 'sched_abc_monthly')) {
      const scheduleAbc: RecurringSchedule = {
        id: 'sched_abc_monthly',
        firmId: 'firm_example_01',
        clientId: 'client_abc_01',
        templateId: 'tmpl_bookkeeping',
        name: 'Monthly Bookkeeping',
        description: 'Monthly bookkeeping preparation, bank feed reconciliation, and VAT workpapers.',
        frequency: 'Monthly',
        nextOccurrence: '2027-04-01',
        dueDateRule: { type: 'day_of_month', daysOffset: 15 },
        reminderFrequencyDays: 3,
        maxReminders: 5,
        status: 'Active',
        lastGeneratedPeriod: 'March 2027',
        lastGeneratedAt: '2027-03-25T09:00:00.000Z',
        createdAt: '2027-01-01T09:00:00.000Z',
        updatedAt: '2027-03-25T09:00:00.000Z',
      };

      const scheduleSmithVat: RecurringSchedule = {
        id: 'sched_smith_vat_quarterly',
        firmId: 'firm_example_01',
        clientId: 'client_smith_02',
        templateId: 'tmpl_vat',
        name: 'Quarterly VAT Return',
        description: 'Quarterly MTD VAT submission and purchase reconciliation pack.',
        frequency: 'Quarterly',
        nextOccurrence: '2027-07-01',
        dueDateRule: { type: 'days_after_start', daysOffset: 14 },
        reminderFrequencyDays: 5,
        maxReminders: 3,
        status: 'Active',
        lastGeneratedPeriod: 'Q1 2027',
        lastGeneratedAt: '2027-03-20T10:00:00.000Z',
        createdAt: '2027-01-01T09:00:00.000Z',
        updatedAt: '2027-03-20T10:00:00.000Z',
      };

      const scheduleGreenfieldAnnual: RecurringSchedule = {
        id: 'sched_greenfield_annual',
        firmId: 'firm_example_01',
        clientId: 'client_greenfield_03',
        templateId: 'tmpl_yearend',
        name: 'Annual Accounts & Corporation Tax',
        description: 'Year-end statutory filing, CT600 preparation, and directors report.',
        frequency: 'Annual',
        nextOccurrence: '2028-01-01',
        dueDateRule: { type: 'days_after_start', daysOffset: 30 },
        reminderFrequencyDays: 7,
        maxReminders: 4,
        status: 'Active',
        lastGeneratedPeriod: 'FY 2026',
        lastGeneratedAt: '2027-02-15T09:00:00.000Z',
        createdAt: '2027-01-01T09:00:00.000Z',
        updatedAt: '2027-02-15T09:00:00.000Z',
      };

      data.recurringSchedules.push(scheduleAbc, scheduleSmithVat, scheduleGreenfieldAnnual);

      // Link March request to sched_abc_monthly
      const marchReq = data.requests.find(r => r.id === 'req_abc_march2027');
      if (marchReq) {
        marchReq.recurringScheduleId = 'sched_abc_monthly';
      }

      // Add past completed January 2027 and February 2027 requests for ABC Ltd
      if (!data.requests.some(r => r.id === 'req_abc_jan2027')) {
        data.requests.push({
          id: 'req_abc_jan2027',
          firmId: 'firm_example_01',
          clientId: 'client_abc_01',
          recurringScheduleId: 'sched_abc_monthly',
          name: 'Monthly Bookkeeping — January 2027',
          description: 'January 2027 monthly reconciliation pack.',
          period: 'January 2027',
          dueDate: '2027-02-15',
          reminderFrequencyDays: 3,
          maxReminders: 5,
          remindersPaused: false,
          status: 'Completed',
          portalToken: 'portal_abc_jan2027_sec001',
          portalTokenHash: crypto.createHash('sha256').update('portal_abc_jan2027_sec001').digest('hex'),
          portalTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          portalTokenRevoked: false,
          reminderCount: 1,
          createdAt: '2027-01-01T09:00:00.000Z',
          updatedAt: '2027-01-20T14:00:00.000Z',
        });
      }

      if (!data.requests.some(r => r.id === 'req_abc_feb2027')) {
        data.requests.push({
          id: 'req_abc_feb2027',
          firmId: 'firm_example_01',
          clientId: 'client_abc_01',
          recurringScheduleId: 'sched_abc_monthly',
          name: 'Monthly Bookkeeping — February 2027',
          description: 'February 2027 monthly reconciliation pack.',
          period: 'February 2027',
          dueDate: '2027-03-15',
          reminderFrequencyDays: 3,
          maxReminders: 5,
          remindersPaused: false,
          status: 'Completed',
          portalToken: 'portal_abc_feb2027_sec002',
          portalTokenHash: crypto.createHash('sha256').update('portal_abc_feb2027_sec002').digest('hex'),
          portalTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          portalTokenRevoked: false,
          reminderCount: 0,
          createdAt: '2027-02-01T09:00:00.000Z',
          updatedAt: '2027-02-18T16:00:00.000Z',
        });
      }
    }
  }

  private seedFirmB(data: DatabaseSchema) {
    const firmB: Firm = {
      id: 'firm_apex_02',
      name: 'Apex Chartered Accountants',
      logoUrl: '',
      defaultReminderDays: 5,
      defaultMaxReminders: 3,
      defaultReminderSubject: 'Apex Request: Outstanding documentation for {{request_name}}',
      defaultReminderBody: 'Dear {{client_name}},\n\nPlease submit the following documents for {{request_name}}:\n{{missing_documents}}\n\nPortal: {{portal_link}}\n\nApex Chartered Accountants',
      plan: 'Practice',
      createdAt: '2026-02-01T09:00:00.000Z',
    };

    const userJames: User = {
      id: 'user_james_03',
      firmId: 'firm_apex_02',
      name: 'James Harrison CTA',
      email: 'james.harrison@apexaccountants.co.uk',
      role: 'admin',
      avatarUrl: '',
      createdAt: '2026-02-01T09:00:00.000Z',
    };

    const userEmily: User = {
      id: 'user_emily_04',
      firmId: 'firm_apex_02',
      name: 'Emily Vance',
      email: 'emily.vance@apexaccountants.co.uk',
      role: 'staff',
      avatarUrl: '',
      createdAt: '2026-02-05T09:00:00.000Z',
    };

    const clientVanguard: Client = {
      id: 'client_vanguard_b1',
      firmId: 'firm_apex_02',
      name: 'Marcus Vance',
      companyName: 'Vanguard Tech Ltd',
      email: 'marcus@vanguardtech.co.uk',
      phone: '+44 131 496 0112',
      status: 'Active',
      assignedStaffId: 'user_james_03',
      notes: 'Firm B confidential client. High technology R&D tax credit claims.',
      createdAt: '2026-02-10T10:00:00.000Z',
      updatedAt: '2026-02-10T10:00:00.000Z',
    };

    const clientHighland: Client = {
      id: 'client_highland_b2',
      firmId: 'firm_apex_02',
      name: 'Fiona MacLeod',
      companyName: 'Highland Hospitality Ltd',
      email: 'fiona@highlandhospitality.co.uk',
      phone: '+44 1463 234 567',
      status: 'Active',
      assignedStaffId: 'user_emily_04',
      notes: 'Firm B confidential client. Hotel and restaurant bookkeeping.',
      createdAt: '2026-02-12T11:00:00.000Z',
      updatedAt: '2026-02-12T11:00:00.000Z',
    };

    const reqB1: DocumentRequest = {
      id: 'req_vanguard_q1tax',
      firmId: 'firm_apex_02',
      clientId: 'client_vanguard_b1',
      name: 'Q1 Corporation Tax Working Papers',
      description: 'Firm B private statutory request.',
      period: 'Q1 2027',
      dueDate: '2027-04-30',
      reminderFrequencyDays: 5,
      maxReminders: 3,
      remindersPaused: false,
      status: 'Active',
      portalToken: 'portal_vanguard_q1tax_sec5512',
      reminderCount: 0,
      createdAt: '2027-03-01T09:00:00.000Z',
      updatedAt: '2027-03-01T09:00:00.000Z',
    };

    const rqB1: DocumentRequirement = {
      id: 'rq_vanguard_item_1',
      requestId: 'req_vanguard_q1tax',
      name: 'Capital Allowances Machinery Invoices',
      description: 'Confidential asset purchase records.',
      required: true,
      status: 'Missing',
      updatedAt: '2027-03-01T09:00:00.000Z',
    };

    const templateB: Template = {
      id: 'tmpl_apex_tax',
      firmId: 'firm_apex_02',
      name: 'Apex Standard Corporation Tax Pack',
      description: 'Firm B proprietary tax review template.',
      category: 'Statutory Accounts',
      createdAt: '2026-02-01T09:00:00.000Z',
      requirements: [
        { id: 'tr_ap_1', templateId: 'tmpl_apex_tax', name: 'Fixed Asset Additions Schedule', description: 'Schedule of capital assets purchased.', required: true },
        { id: 'tr_ap_2', templateId: 'tmpl_apex_tax', name: 'R&D Project Log', description: 'Technical documentation for R&D claims.', required: true },
      ],
    };

    data.firms.push(firmB);
    data.users.push(userJames, userEmily);
    data.clients.push(clientVanguard, clientHighland);
    data.requests.push(reqB1);
    data.requirements.push(rqB1);
    data.templates.push(templateB);
  }

  private generateInitialDemoData(): DatabaseSchema {
    const firmId = 'firm_example_01';
    const userId1 = 'user_sarah_01';
    const userId2 = 'user_alex_02';

    const firm: Firm = {
      id: firmId,
      name: 'Example Accounting Ltd',
      logoUrl: '',
      defaultReminderDays: 3,
      defaultMaxReminders: 5,
      defaultReminderSubject: 'Documents still needed for {{request_name}}',
      defaultReminderBody: `Hi {{client_name}},\n\nWe're still waiting for the following documents for {{request_name}}:\n\n{{missing_documents}}\n\nPlease upload them using your secure client portal:\n{{portal_link}}\n\nThank you,\n{{firm_name}}`,
      plan: 'Professional',
      createdAt: '2026-01-15T09:00:00.000Z',
    };

    const users: User[] = [
      {
        id: userId1,
        firmId,
        name: 'Sarah Jenkins FCA',
        email: 'sarah.jenkins@exampleaccounting.co.uk',
        role: 'admin',
        avatarUrl: '/src/assets/images/avatar_accountant_sarah_1790848118826.jpg',
        createdAt: '2026-01-15T09:00:00.000Z',
      },
      {
        id: userId2,
        firmId,
        name: 'Alex Miller',
        email: 'alex.miller@exampleaccounting.co.uk',
        role: 'staff',
        avatarUrl: '',
        createdAt: '2026-02-01T10:00:00.000Z',
      },
    ];

    const client1: Client = {
      id: 'client_abc_01',
      firmId,
      name: 'David Smith',
      companyName: 'ABC Consulting Ltd',
      email: 'david@abcconsulting.co.uk',
      phone: '+44 20 7946 0192',
      status: 'Active',
      assignedStaffId: userId1,
      notes: 'Monthly bookkeeping retainer client. High-volume bank transactions on Barclays and Amex.',
      createdAt: '2026-01-20T11:00:00.000Z',
      updatedAt: '2026-03-28T14:00:00.000Z',
    };

    const client2: Client = {
      id: 'client_smith_02',
      firmId,
      name: 'Elena Rostova',
      companyName: 'Smith & Co Digital Ltd',
      email: 'elena@smithandco.co.uk',
      phone: '+44 161 496 0381',
      status: 'Active',
      assignedStaffId: userId1,
      notes: 'Quarterly VAT client. Always prompts quickly after reminders.',
      createdAt: '2026-02-10T14:30:00.000Z',
      updatedAt: '2026-03-29T10:15:00.000Z',
    };

    const client3: Client = {
      id: 'client_greenfield_03',
      firmId,
      name: 'Marcus Greenfield',
      companyName: 'Greenfield Services Ltd',
      email: 'marcus@greenfieldservices.co.uk',
      phone: '+44 113 496 0884',
      status: 'Active',
      assignedStaffId: userId2,
      notes: 'Year-end accounts preparation. Needs close attention on fixed asset invoices.',
      createdAt: '2026-01-22T08:45:00.000Z',
      updatedAt: '2026-03-30T16:20:00.000Z',
    };

    const client4: Client = {
      id: 'client_northstar_04',
      firmId,
      name: 'Chloe Jackson',
      companyName: 'Northstar Design Ltd',
      email: 'chloe@northstardesign.studio',
      phone: '+44 117 496 0529',
      status: 'Onboarding',
      assignedStaffId: userId2,
      notes: 'New creative agency client. Waiting on AML documentation and bank proof.',
      createdAt: '2026-03-15T09:30:00.000Z',
      updatedAt: '2026-03-25T11:10:00.000Z',
    };

    const clients = [client1, client2, client3, client4];

    // Templates
    const templates: Template[] = [
      {
        id: 'tmpl_bookkeeping',
        firmId,
        name: 'Monthly Bookkeeping',
        description: 'Standard monthly pack covering bank feeds, credit cards, sales, purchases, and petty receipts.',
        category: 'Bookkeeping',
        createdAt: '2026-01-16T10:00:00.000Z',
        requirements: [
          { id: 'tr_1', templateId: 'tmpl_bookkeeping', name: 'Barclays Main Current Account Statement', description: 'PDF statement covering the full calendar month including opening and closing balances.', required: true },
          { id: 'tr_2', templateId: 'tmpl_bookkeeping', name: 'Credit Card Statement', description: 'Monthly company credit card statement with full transaction list.', required: true },
          { id: 'tr_3', templateId: 'tmpl_bookkeeping', name: 'Sales Invoices & Customer Receipts', description: 'Export of sales ledger or PDF copies of all customer invoices issued.', required: true },
          { id: 'tr_4', templateId: 'tmpl_bookkeeping', name: 'Supplier / Purchase Invoices', description: 'Invoices for all goods or services purchased during this month.', required: true },
          { id: 'tr_5', templateId: 'tmpl_bookkeeping', name: 'Expense Receipts & Mileage', description: 'Staff travel, client entertainment, parking receipts and mileage logs.', required: false },
          { id: 'tr_6', templateId: 'tmpl_bookkeeping', name: 'Payroll Summary Report', description: 'P32 or payroll gross-to-net report from your payroll software.', required: true },
        ],
      },
      {
        id: 'tmpl_yearend',
        firmId,
        name: 'Year End Accounts & Corporation Tax',
        description: 'Comprehensive year-end statutory compliance pack.',
        category: 'Statutory Accounts',
        createdAt: '2026-01-16T10:15:00.000Z',
        requirements: [
          { id: 'tr_ye_1', templateId: 'tmpl_yearend', name: 'Year-End Bank Statements', description: 'Statements confirming balance on the exact financial year-end date.', required: true },
          { id: 'tr_ye_2', templateId: 'tmpl_yearend', name: 'Business Loan & HP Agreements', description: 'Any loan balance certificates, HP contracts, or interest letters.', required: true },
          { id: 'tr_ye_3', templateId: 'tmpl_yearend', name: 'Fixed Asset Additions & Disposals', description: 'Invoices for equipment, computers, vehicles purchased over £500.', required: true },
          { id: 'tr_ye_4', templateId: 'tmpl_yearend', name: 'Stock / Inventory Valuation', description: 'Stock valuation certificate signed at close of business on year-end.', required: false },
          { id: 'tr_ye_5', templateId: 'tmpl_yearend', name: 'PAYE & Pension Year End Returns', description: 'P60s and pension provider year-end reconciliation statements.', required: true },
          { id: 'tr_ye_6', templateId: 'tmpl_yearend', name: 'Directors Loan Account Details', description: 'Notes on personal funds introduced or drawings made outside salary.', required: false },
        ],
      },
      {
        id: 'tmpl_vat',
        firmId,
        name: 'Quarterly VAT Return',
        description: 'Standard UK MTD VAT quarter preparation pack.',
        category: 'VAT',
        createdAt: '2026-01-16T10:30:00.000Z',
        requirements: [
          { id: 'tr_vat_1', templateId: 'tmpl_vat', name: 'Sales Invoices Breakdown', description: 'Full breakdown of standard rated, zero-rated and exempt sales.', required: true },
          { id: 'tr_vat_2', templateId: 'tmpl_vat', name: 'Purchase VAT Invoices & Receipts', description: 'Valid VAT receipts for all business expenses claimed.', required: true },
          { id: 'tr_vat_3', templateId: 'tmpl_vat', name: 'Import / Export C79 Documents', description: 'Customs C79 certificates and postponed VAT accounting statements.', required: false },
        ],
      },
      {
        id: 'tmpl_aml',
        firmId,
        name: 'New Client Onboarding & AML',
        description: 'Anti-money laundering and client verification files required by ICAEW/HMRC.',
        category: 'Onboarding',
        createdAt: '2026-02-01T09:00:00.000Z',
        requirements: [
          { id: 'tr_aml_1', templateId: 'tmpl_aml', name: 'Director Photo ID (Passport or Driving Licence)', description: 'Clear color photo or scan of valid government-issued passport or UK driving licence.', required: true },
          { id: 'tr_aml_2', templateId: 'tmpl_aml', name: 'Proof of Residential Address', description: 'Utility bill, council tax statement or bank letter dated within the last 3 months.', required: true },
          { id: 'tr_aml_3', templateId: 'tmpl_aml', name: 'Company Certificate of Incorporation', description: 'Companies House registration document and UTR confirmation.', required: true },
        ],
      },
    ];

    // Document Requests
    const req1Id = 'req_abc_march2027';
    const req2Id = 'req_smith_vat_q1';
    const req3Id = 'req_greenfield_yearend';
    const req4Id = 'req_northstar_aml';

    const requests: DocumentRequest[] = [
      {
        id: req1Id,
        firmId,
        clientId: client1.id,
        name: 'March 2027 Bookkeeping',
        description: 'Monthly bookkeeping pack for March 2027 reconciliations and management report.',
        period: 'March 2027',
        dueDate: '2027-04-10',
        reminderFrequencyDays: 3,
        maxReminders: 5,
        remindersPaused: false,
        status: 'Active',
        portalToken: 'portal_abc_march2027_sec9812',
        lastReminderSentAt: '2027-04-02T10:00:00.000Z',
        reminderCount: 2,
        createdAt: '2027-03-25T09:00:00.000Z',
        updatedAt: '2027-04-02T10:00:00.000Z',
      },
      {
        id: req2Id,
        firmId,
        clientId: client2.id,
        name: 'Q1 2027 VAT Return',
        description: 'Quarterly VAT filing for period ending 31 March 2027.',
        period: 'Q1 2027 (Jan–Mar)',
        dueDate: '2027-04-15',
        reminderFrequencyDays: 5,
        maxReminders: 3,
        remindersPaused: false,
        status: 'Completed',
        portalToken: 'portal_smith_vatq1_sec3419',
        lastReminderSentAt: '2027-03-28T09:30:00.000Z',
        reminderCount: 1,
        createdAt: '2027-03-20T10:00:00.000Z',
        updatedAt: '2027-03-29T16:00:00.000Z',
      },
      {
        id: req3Id,
        firmId,
        clientId: client3.id,
        name: '2026/27 Year End Statutory Accounts',
        description: 'Preparation of statutory financial statements and CT600 tax return.',
        period: 'Year Ended 31 Dec 2026',
        dueDate: '2027-03-25',
        reminderFrequencyDays: 3,
        maxReminders: 5,
        remindersPaused: false,
        status: 'Overdue',
        portalToken: 'portal_greenfield_ye2026_sec7721',
        lastReminderSentAt: '2027-03-26T11:00:00.000Z',
        reminderCount: 4,
        createdAt: '2027-03-01T09:00:00.000Z',
        updatedAt: '2027-03-26T11:00:00.000Z',
      },
      {
        id: req4Id,
        firmId,
        clientId: client4.id,
        name: 'Client Onboarding & AML Compliance',
        description: 'Mandatory identity and business verification before engagement commencement.',
        period: 'Onboarding 2027',
        dueDate: '2027-04-05',
        reminderFrequencyDays: 3,
        maxReminders: 3,
        remindersPaused: false,
        status: 'Active',
        portalToken: 'portal_northstar_onboarding_sec1104',
        lastReminderSentAt: '2027-03-28T08:00:00.000Z',
        reminderCount: 1,
        createdAt: '2027-03-22T14:00:00.000Z',
        updatedAt: '2027-03-28T08:00:00.000Z',
      },
    ];

    const samplePdfData = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCj4+CmVuZG9iagoxIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyA0IDAgUgo+PgplbmRvYmoKMyAwIG9iago8PAovTGVuZ3RoIDQzCj4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzIgNzEyIFRECihoZWxsbyBkb2N1bWVudGNoYXNlcikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iag==';
    const sampleCsvData = 'data:text/csv;base64,RGF0ZSxEZXNjcmlwdGlvbixBbW91bnQsQmFsYW5jZQowMS8wMy8yMDI3LE9wZW5pbmcgQmFsYW5jZSwwLjAwLDQ1MjAwLjUwCjA1LzAzLzIwMjcsQ2xpZW50IEludm9pY2UgMTAwMSw1MDAwLjAwLDUwMjAwLjUw';

    const documents: DocumentFile[] = [
      {
        id: 'doc_1',
        firmId,
        requestId: req1Id,
        requirementId: 'rq_abc_1',
        filename: 'Barclays_Statement_March2027.pdf',
        originalName: 'Barclays_March_2027.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 245000,
        status: 'Approved',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-04-01T14:22:00.000Z',
        reviewedAt: '2027-04-01T15:10:00.000Z',
        reviewedBy: 'Sarah Jenkins FCA',
      },
      {
        id: 'doc_2',
        firmId,
        requestId: req1Id,
        requirementId: 'rq_abc_2',
        filename: 'Amex_Card_March2027_incomplete.pdf',
        originalName: 'Amex_March_Statement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 112000,
        status: 'Rejected',
        rejectionReason: 'Bank statement is missing pages 3–4. Please upload a complete statement.',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-04-01T16:05:00.000Z',
        reviewedAt: '2027-04-01T16:40:00.000Z',
        reviewedBy: 'Sarah Jenkins FCA',
      },
      {
        id: 'doc_3',
        firmId,
        requestId: req1Id,
        requirementId: 'rq_abc_3',
        filename: 'Sales_Ledger_March2027.csv',
        originalName: 'Sales_Invoices_March.csv',
        mimeType: 'text/csv',
        sizeBytes: 45000,
        status: 'Approved',
        fileDataUri: sampleCsvData,
        uploadedAt: '2027-04-02T09:15:00.000Z',
        reviewedAt: '2027-04-02T10:05:00.000Z',
        reviewedBy: 'Alex Miller',
      },
      {
        id: 'doc_4',
        firmId,
        requestId: req1Id,
        requirementId: 'rq_abc_4',
        filename: 'Supplier_Invoices_Batch.pdf',
        originalName: 'Supplier_Invoices_Batch.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 890000,
        status: 'Uploaded',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-04-02T09:40:00.000Z',
      },
      {
        id: 'doc_5',
        firmId,
        requestId: req1Id,
        requirementId: 'rq_abc_5',
        filename: 'Staff_Mileage_Receipts.pdf',
        originalName: 'March_Receipts.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200000,
        status: 'Approved',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-04-01T11:30:00.000Z',
        reviewedAt: '2027-04-01T12:00:00.000Z',
        reviewedBy: 'Sarah Jenkins FCA',
      },
      {
        id: 'doc_smith_1',
        firmId,
        requestId: req2Id,
        requirementId: 'rq_smith_1',
        filename: 'Q1_Sales_Report.pdf',
        originalName: 'Q1_Sales_Report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 310000,
        status: 'Approved',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-03-28T14:00:00.000Z',
        reviewedAt: '2027-03-29T10:00:00.000Z',
        reviewedBy: 'Sarah Jenkins FCA',
      },
      {
        id: 'doc_smith_2',
        firmId,
        requestId: req2Id,
        requirementId: 'rq_smith_2',
        filename: 'Q1_Purchases_Receipts.pdf',
        originalName: 'Q1_Purchases_Receipts.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 740000,
        status: 'Approved',
        fileDataUri: samplePdfData,
        uploadedAt: '2027-03-28T14:15:00.000Z',
        reviewedAt: '2027-03-29T10:10:00.000Z',
        reviewedBy: 'Sarah Jenkins FCA',
      },
    ];

    const requirements: DocumentRequirement[] = [
      { id: 'rq_abc_1', requestId: req1Id, name: 'Barclays Main Current Account Statement', description: 'Complete March statement showing opening/closing balance.', required: true, status: 'Approved', uploadedDocumentId: 'doc_1', updatedAt: '2027-04-01T15:10:00.000Z' },
      { id: 'rq_abc_2', requestId: req1Id, name: 'Credit Card Statement', description: 'Monthly company credit card statement with full transaction list.', required: true, status: 'Rejected', rejectionReason: 'Bank statement is missing pages 3–4. Please upload a complete statement.', uploadedDocumentId: 'doc_2', updatedAt: '2027-04-01T16:40:00.000Z' },
      { id: 'rq_abc_3', requestId: req1Id, name: 'Sales Invoices & Customer Receipts', description: 'Sales ledger export or PDF copies of issued customer invoices.', required: true, status: 'Approved', uploadedDocumentId: 'doc_3', updatedAt: '2027-04-02T10:05:00.000Z' },
      { id: 'rq_abc_4', requestId: req1Id, name: 'Purchase Invoices', description: 'Invoices for goods and services bought in March.', required: true, status: 'Uploaded', uploadedDocumentId: 'doc_4', updatedAt: '2027-04-02T09:40:00.000Z' },
      { id: 'rq_abc_5', requestId: req1Id, name: 'Expense Receipts & Mileage', description: 'Receipts for travel, food and parking.', required: false, status: 'Approved', uploadedDocumentId: 'doc_5', updatedAt: '2027-04-01T12:00:00.000Z' },
      { id: 'rq_abc_6', requestId: req1Id, name: 'Payroll Summary Report (P32)', description: 'Gross to net payroll breakdown for March month end.', required: true, status: 'Missing', updatedAt: '2027-03-25T09:00:00.000Z' },
      { id: 'rq_abc_7', requestId: req1Id, name: 'Business Loan Statement', description: 'Interest and principal statement from NatWest loan.', required: false, status: 'Not applicable', clientNote: 'Not applicable because this loan was fully paid off in January 2027.', updatedAt: '2027-04-01T10:00:00.000Z' },
      { id: 'rq_abc_8', requestId: req1Id, name: 'Petty Cash Reconciliations', description: 'Float summary and physical cash receipts log.', required: true, status: 'Missing', updatedAt: '2027-03-25T09:00:00.000Z' },
      { id: 'rq_smith_1', requestId: req2Id, name: 'Sales Invoices Breakdown', description: 'Summary and breakdown of standard-rated sales for Q1.', required: true, status: 'Approved', uploadedDocumentId: 'doc_smith_1', updatedAt: '2027-03-29T10:00:00.000Z' },
      { id: 'rq_smith_2', requestId: req2Id, name: 'Purchase VAT Invoices & Receipts', description: 'Valid VAT receipts for claims.', required: true, status: 'Approved', uploadedDocumentId: 'doc_smith_2', updatedAt: '2027-03-29T10:10:00.000Z' },
      { id: 'rq_smith_3', requestId: req2Id, name: 'Import / Export C79 Documents', description: 'Customs import VAT documentation.', required: false, status: 'Not applicable', clientNote: 'No overseas imports this quarter.', updatedAt: '2027-03-28T14:30:00.000Z' },
      { id: 'rq_gf_1', requestId: req3Id, name: 'Year-End Bank Statements', description: 'Statements confirming balance at 31 Dec 2026.', required: true, status: 'Approved', updatedAt: '2027-03-10T11:00:00.000Z' },
      { id: 'rq_gf_2', requestId: req3Id, name: 'Business Loan & HP Agreements', description: 'Agreements and year-end interest certificates.', required: true, status: 'Missing', updatedAt: '2027-03-01T09:00:00.000Z' },
      { id: 'rq_gf_3', requestId: req3Id, name: 'Fixed Asset Additions & Disposals', description: 'Invoices for machinery or vans purchased during the year.', required: true, status: 'Missing', updatedAt: '2027-03-01T09:00:00.000Z' },
      { id: 'rq_gf_4', requestId: req3Id, name: 'Stock / Inventory Valuation', description: 'Year-end inventory count breakdown.', required: false, status: 'Not applicable', clientNote: 'Service business, zero inventory held.', updatedAt: '2027-03-12T14:00:00.000Z' },
      { id: 'rq_gf_5', requestId: req3Id, name: 'PAYE & Pension Year End Returns', description: 'P60s and pension provider year-end statements.', required: true, status: 'Missing', updatedAt: '2027-03-01T09:00:00.000Z' },
      { id: 'rq_gf_6', requestId: req3Id, name: 'Directors Loan Account Details', description: 'Notes on personal funds introduced or drawings.', required: false, status: 'Uploaded', updatedAt: '2027-03-24T16:00:00.000Z' },
      { id: 'rq_ns_1', requestId: req4Id, name: 'Director Photo ID (Passport or Driving Licence)', description: 'Clear copy of passport.', required: true, status: 'Approved', updatedAt: '2027-03-24T10:00:00.000Z' },
      { id: 'rq_ns_2', requestId: req4Id, name: 'Proof of Residential Address', description: 'Utility bill dated within 3 months.', required: true, status: 'Approved', updatedAt: '2027-03-24T10:15:00.000Z' },
      { id: 'rq_ns_3', requestId: req4Id, name: 'Company Certificate of Incorporation', description: 'Companies House certificate and UTR notice.', required: true, status: 'Missing', updatedAt: '2027-03-22T14:00:00.000Z' },
    ];

    const reminders: Reminder[] = [
      {
        id: 'rem_1',
        firmId,
        requestId: req1Id,
        clientId: client1.id,
        reminderNumber: 2,
        recipientEmail: client1.email,
        recipientName: client1.name,
        subject: 'Documents still needed for March 2027 Bookkeeping',
        body: `Hi David,\n\nWe're still waiting for the following documents for March 2027 Bookkeeping:\n- Credit Card Statement (Rejected: Please upload a complete statement)\n- Payroll Summary Report (P32)\n\nPlease upload them using your secure client portal link.\n\nThank you,\nExample Accounting Ltd`,
        missingDocuments: ['Credit Card Statement', 'Payroll Summary Report (P32)'],
        sentAt: '2027-04-02T10:00:00.000Z',
        triggerType: 'automated',
        deliveryStatus: 'simulated',
        status: 'sent',
      },
      {
        id: 'rem_2',
        firmId,
        requestId: req1Id,
        clientId: client1.id,
        reminderNumber: 1,
        recipientEmail: client1.email,
        recipientName: client1.name,
        subject: 'Reminder: March 2027 Bookkeeping documents',
        body: `Hi David,\n\nJust a quick reminder that your March bookkeeping documents are due soon.\n\nThank you,\nExample Accounting Ltd`,
        missingDocuments: ['Bank Statement', 'Credit Card Statement', 'Sales Invoices', 'Supplier Invoices'],
        sentAt: '2027-03-30T10:00:00.000Z',
        triggerType: 'automated',
        deliveryStatus: 'simulated',
        status: 'sent',
      },
      {
        id: 'rem_3',
        firmId,
        requestId: req3Id,
        clientId: client3.id,
        reminderNumber: 1,
        recipientEmail: client3.email,
        recipientName: client3.name,
        subject: 'URGENT: Outstanding Year-End Accounts Documents',
        body: `Hi Marcus,\n\nYour 2026/27 Year End Statutory Accounts documents are now overdue (Due 25 March).\n\nStill required:\n- Business Loan & HP Agreements\n- Fixed Asset Additions & Disposals\n- PAYE & Pension Year End Returns\n\nPlease upload them as soon as possible to avoid Companies House late penalties.\n\nThank you,\nExample Accounting Ltd`,
        missingDocuments: ['Business Loan & HP Agreements', 'Fixed Asset Additions & Disposals', 'PAYE & Pension Year End Returns'],
        sentAt: '2027-03-26T11:00:00.000Z',
        triggerType: 'manual',
        deliveryStatus: 'simulated',
        status: 'sent',
      },
    ];

    const activityLogs: ActivityLog[] = [
      { id: 'act_1', firmId, requestId: req1Id, clientId: client1.id, action: 'document_uploaded', description: 'ABC Consulting Ltd uploaded Supplier_Invoices_Batch.pdf', actorType: 'client', actorName: 'David Smith', createdAt: '2027-04-02T09:40:00.000Z' },
      { id: 'act_2', firmId, requestId: req1Id, clientId: client1.id, action: 'document_approved', description: 'Sarah Jenkins approved Sales Invoices & Customer Receipts', actorType: 'accountant', actorName: 'Sarah Jenkins FCA', createdAt: '2027-04-02T10:05:00.000Z' },
      { id: 'act_3', firmId, requestId: req1Id, clientId: client1.id, action: 'reminder_sent', description: 'Automated reminder #2 sent to david@abcconsulting.co.uk', actorType: 'system', actorName: 'DocumentChaser Automated Chaser', createdAt: '2027-04-02T10:00:00.000Z' },
      { id: 'act_4', firmId, requestId: req1Id, clientId: client1.id, action: 'document_rejected', description: 'Sarah Jenkins rejected Credit Card Statement (missing pages 3–4)', actorType: 'accountant', actorName: 'Sarah Jenkins FCA', createdAt: '2027-04-01T16:40:00.000Z' },
      { id: 'act_5', firmId, requestId: req2Id, clientId: client2.id, action: 'request_completed', description: 'Smith & Co completed Q1 2027 VAT Return request (100% complete)', actorType: 'system', actorName: 'System', createdAt: '2027-03-29T16:00:00.000Z' },
      { id: 'act_6', firmId, requestId: req4Id, clientId: client4.id, action: 'document_uploaded', description: 'Northstar Design Ltd uploaded Proof of Residential Address', actorType: 'client', actorName: 'Chloe Jackson', createdAt: '2027-03-24T10:15:00.000Z' },
    ];

    const dataset: DatabaseSchema = {
      firms: [firm],
      users,
      clients,
      requests,
      requirements,
      documents,
      reminders,
      templates,
      recurringSchedules: [],
      activityLogs,
      sessions: [],
    };

    // Add Firm B for tenant isolation verification
    this.seedFirmB(dataset);
    this.ensureDefaultSessions(dataset);
    this.ensureRecurringSchedules(dataset);

    return dataset;
  }
}

export const db = new StorageEngine();
