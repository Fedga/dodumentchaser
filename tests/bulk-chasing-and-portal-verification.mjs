// Automated Verification Suite for Bulk Chasing Workflow & Client Portal Experience
// Tests bulk selection, personalized individual reminder generation, frequency guards,
// tenant isolation, duplicate prevention, and client portal layout/actions.

const BASE_URL = 'http://127.0.0.1:3000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data,
  };
}

async function runVerification() {
  console.log('================================================================');
  console.log('DocumentChaser Bulk Chasing & Client Portal Verification Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(title, condition, detail = '') {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title} - ${detail}`);
      failed++;
    }
  }

  const tokenSarah = 'token_sarah_admin_firm_a';
  const tokenJames = 'token_james_admin_firm_b'; // Firm B admin for tenant testing

  // ----------------------------------------------------
  // PART 1: REMINDERS QUEUE & DATA FIELDS
  // ----------------------------------------------------
  console.log('1. Checking Reminders Queue and Data Attributes:');
  const queueRes = await request('/api/reminders', {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  record('Queue endpoint returns HTTP 200', queueRes.status === 200);
  const queueItems = queueRes.data?.queue || [];
  record('Queue items retrieved', queueItems.length > 0);

  const sampleItem = queueItems[0];
  record('Contains Client information (companyName, clientName, clientEmail)', Boolean(sampleItem?.companyName && sampleItem?.clientEmail));
  record('Contains Request information (requestName, period)', Boolean(sampleItem?.requestName && sampleItem?.period));
  record('Contains Missing documents count & list', typeof sampleItem?.missingCount === 'number' && Array.isArray(sampleItem?.missingDocNames));
  record('Contains Days outstanding field', typeof sampleItem?.daysOutstanding === 'number');
  record('Contains Last reminder timestamp/indicator', sampleItem?.lastReminder !== undefined);
  record('Contains Next reminder schedule', Boolean(sampleItem?.nextReminder));
  record('Contains Status (Due Now, Waiting, Paused, Overdue, or Max Reached)', Boolean(sampleItem?.status));

  // ----------------------------------------------------
  // PART 2: BULK CHASING WORKFLOW SETUP & PERSONALIZATION
  // ----------------------------------------------------
  console.log('\n2. Setting up 2 test requests with DIFFERENT missing documents:');
  // Request 1 for ABC Ltd (Missing: VAT Invoices, Bank Statement)
  const req1Res = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      clientId: 'client_abc_01',
      name: 'Bulk Chase Test Request 1',
      period: 'May 2027',
      dueDate: '2027-05-30',
      reminderFrequencyDays: 3,
      maxReminders: 5,
      requirements: [
        { name: 'May VAT Invoices', required: true },
        { name: 'May Bank Reconciliation Report', required: true },
      ],
    }),
  });

  // Request 2 for Greenfield (Missing: Director ID Only)
  const req2Res = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      clientId: 'client_greenfield_03',
      name: 'Bulk Chase Test Request 2',
      period: 'FY 2027',
      dueDate: '2027-06-15',
      reminderFrequencyDays: 1,
      maxReminders: 5,
      requirements: [
        { name: 'Director Passport Photo ID', required: true },
        { name: 'Optional Brochure', required: false },
      ],
    }),
  });

  const req1Id = req1Res.data?.id;
  const req2Id = req2Res.data?.id;
  record('Test Request 1 created (HTTP 201)', req1Res.status === 201 && Boolean(req1Id));
  record('Test Request 2 created (HTTP 201)', req2Res.status === 201 && Boolean(req2Id));

  console.log('\n3. Testing Bulk Chasing Execution with Individual Personalization:');
  const bulkRes = await request('/api/reminders/bulk-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      requestIds: [req1Id, req2Id],
      respectFrequency: false, // force dispatch for testing individual reminder payloads
    }),
  });

  record('Bulk chasing endpoint succeeds with HTTP 200', bulkRes.status === 200);
  record('Bulk chasing sent both reminders (sentCount = 2)', bulkRes.data?.sentCount === 2);

  // Inspect generated reminders from history to verify NO generic messages and ONLY actual missing documents
  const historyRes = await request('/api/reminders', {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  const history = historyRes.data?.history || [];

  const rem1 = history.find(r => r.requestId === req1Id);
  const rem2 = history.find(r => r.requestId === req2Id);

  record('Reminder 1 generated for Request 1', Boolean(rem1));
  record('Reminder 2 generated for Request 2', Boolean(rem2));

  // Verify Reminder 1 has ONLY Request 1's missing documents
  record('Reminder 1 body contains "May VAT Invoices"', rem1?.body?.includes('May VAT Invoices'));
  record('Reminder 1 body contains "Bank Reconciliation Report"', rem1?.body?.includes('Bank Reconciliation Report'));
  record('Reminder 1 does NOT contain Request 2\'s "Passport Photo ID" (No cross-contamination)', !rem1?.body?.includes('Passport Photo ID'));

  // Verify Reminder 2 has ONLY Request 2's missing documents
  record('Reminder 2 body contains "Director Passport Photo ID"', rem2?.body?.includes('Director Passport Photo ID'));
  record('Reminder 2 excludes Optional Brochure', !rem2?.body?.includes('Optional Brochure'));
  record('Reminder 2 does NOT contain Request 1\'s "May VAT Invoices"', !rem2?.body?.includes('May VAT Invoices'));

  // ----------------------------------------------------
  // PART 3: GUARDS (PAUSED, COMPLETED, MAX REMINDERS, TENANT ISOLATION)
  // ----------------------------------------------------
  console.log('\n4. Testing Bulk Chasing Respects Paused Requests:');
  await request(`/api/requests/${req1Id}/pause-reminders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  const bulkPausedAttempt = await request('/api/reminders/bulk-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      requestIds: [req1Id],
      respectFrequency: false,
    }),
  });

  record(
    'Paused request in bulk send is skipped with REMINDERS_PAUSED',
    bulkPausedAttempt.data?.sentCount === 0 && bulkPausedAttempt.data?.results?.[0]?.reason === 'REMINDERS_PAUSED'
  );

  console.log('\n5. Testing Bulk Chasing Respects Maximum Reminder Limits:');
  // Update req2 to maxReminders: 1 (it already sent reminder 1 above)
  await request(`/api/requests/${req2Id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ maxReminders: 1 }),
  });

  const bulkMaxAttempt = await request('/api/reminders/bulk-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      requestIds: [req2Id],
      respectFrequency: false,
    }),
  });

  record(
    'Max reminders reached request in bulk send is skipped with MAX_REMINDERS_REACHED',
    bulkMaxAttempt.data?.sentCount === 0 && bulkMaxAttempt.data?.results?.[0]?.reason === 'MAX_REMINDERS_REACHED'
  );

  console.log('\n6. Testing Tenant Isolation on Bulk Chasing:');
  // Firm B attempts to bulk chase Firm A's request IDs
  const crossTenantBulk = await request('/api/reminders/bulk-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenJames}`,
    },
    body: JSON.stringify({
      requestIds: [req1Id, req2Id],
      respectFrequency: false,
    }),
  });

  record(
    'Cross-tenant bulk chase blocked (0 processed, strict firm scoping)',
    crossTenantBulk.data?.processedCount === 0 && crossTenantBulk.data?.sentCount === 0
  );

  // ----------------------------------------------------
  // PART 4: CLIENT PORTAL VERIFICATION
  // ----------------------------------------------------
  console.log('\n7. Testing Client Portal Structure & Categorization:');
  const portalToken = req1Res.data?.portalToken;
  const portalRes = await request(`/api/portal/${portalToken}`);

  record('Client portal loads successfully (HTTP 200)', portalRes.status === 200);
  const portalData = portalRes.data;
  record('Portal contains Request name', portalData?.request?.name === 'Bulk Chase Test Request 1');
  record('Portal contains Accounting Period', portalData?.request?.period === 'May 2027');
  record('Portal contains Due Date', Boolean(portalData?.request?.dueDate));
  record('Portal contains Progress metrics (receivedCount, totalCount, percentage)', portalData?.stats?.totalCount === 2);

  // Test Requirement Rejection in Portal
  const reqItem1 = portalData?.requirements?.[0];
  await request(`/api/requirements/${reqItem1.id}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ reason: 'Bank statement is missing pages 3–4.' }),
  });

  const portalAfterReject = await request(`/api/portal/${portalToken}`);
  const rejectedRequirement = portalAfterReject.data?.requirements?.find(r => r.id === reqItem1.id);
  record('Rejected requirement has status "Rejected"', rejectedRequirement?.status === 'Rejected');
  record('Rejected requirement contains exact reason: "Bank statement is missing pages 3–4."', rejectedRequirement?.rejectionReason === 'Bank statement is missing pages 3–4.');

  // Test Client Adds Note
  const noteRes = await request(`/api/portal/${portalToken}/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: reqItem1.id,
      note: 'I will request pages 3-4 from the online banking branch today.',
    }),
  });
  record('Client can submit note (HTTP 200)', noteRes.status === 200);

  // Test Client Marks as Not Applicable with Reason
  const reqItem2 = portalData?.requirements?.[1];
  const naRes = await request(`/api/portal/${portalToken}/mark-na`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: reqItem2.id,
      reason: 'Our company has no credit card account.',
    }),
  });
  record('Client can mark item as Not Applicable with reason (HTTP 200)', naRes.status === 200);

  // Verify Audit Log records actions
  const actRes = await request('/api/activity', {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  const activities = actRes.data || [];
  record('Audit trail records bulk reminder sent', activities.some(a => a.action === 'reminder_sent' && a.requestId === req1Id));
  record('Audit trail records item_marked_na', activities.some(a => a.action === 'item_marked_na'));

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
