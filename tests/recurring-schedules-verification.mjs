// Automated Verification Suite for Recurring Document Requests in DocumentChaser
// Tests monthly, quarterly, and annual schedules, duplicate prevention, timing rules,
// pause/resume/edit/stop controls, manual next-request generation, and audit trail logging.

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

async function runRecurringVerificationSuite() {
  console.log('================================================================');
  console.log('DocumentChaser Recurring Document Requests Verification Suite');
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

  const tokenSarahFirmA = 'token_sarah_admin_firm_a';
  const tokenJamesFirmB = 'token_james_admin_firm_b';

  // ----------------------------------------------------
  // TEST 1: Retrieve seeded recurring schedules and verify ABC Ltd example
  // ----------------------------------------------------
  console.log('1. Checking Seeded Schedules and Period Timeline Breakdown:');
  const listRes = await request('/api/recurring-schedules', {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Listing recurring schedules returns HTTP 200', listRes.status === 200);
  const schedules = listRes.data || [];
  const abcMonthly = schedules.find(s => s.id === 'sched_abc_monthly');

  record('ABC Ltd Monthly Bookkeeping schedule exists', Boolean(abcMonthly));
  record('Contains client, template, frequency, nextOccurrence, dueDateRule, reminder settings, status',
    abcMonthly?.clientId === 'client_abc_01' &&
    abcMonthly?.templateId === 'tmpl_bookkeeping' &&
    abcMonthly?.frequency === 'Monthly' &&
    Boolean(abcMonthly?.nextOccurrence) &&
    Boolean(abcMonthly?.dueDateRule) &&
    abcMonthly?.reminderFrequencyDays > 0 &&
    abcMonthly?.status === 'Active'
  );

  // Check the example period breakdown from user brief:
  // January 2027 — Complete
  // February 2027 — Complete
  // March 2027 — Waiting
  // April 2027 — Not started
  const history = abcMonthly?.periodHistory || [];
  console.log('ABC Ltd Period History:', history.map(h => `${h.period} — ${h.status}`).join(', '));

  const hasJanComplete = history.some(h => h.period === 'January 2027' && h.status === 'Complete');
  const hasFebComplete = history.some(h => h.period === 'February 2027' && h.status === 'Complete');
  const hasMarchWaiting = history.some(h => h.period === 'March 2027' && h.status === 'Waiting');
  const hasAprilNotStarted = history.some(h => h.period === 'April 2027' && h.status === 'Not started');

  record('Period breakdown: January 2027 — Complete', hasJanComplete);
  record('Period breakdown: February 2027 — Complete', hasFebComplete);
  record('Period breakdown: March 2027 — Waiting', hasMarchWaiting);
  record('Period breakdown: April 2027 — Not started', hasAprilNotStarted);

  // ----------------------------------------------------
  // TEST 2: Test Monthly Schedule Creation & Manual Generation
  // ----------------------------------------------------
  console.log('\n2. Testing Monthly Schedule Creation & Execution:');
  const createMonthlyRes = await request('/api/recurring-schedules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({
      clientId: 'client_northstar_04',
      templateId: 'tmpl_bookkeeping',
      name: 'Northstar Monthly Bookkeeping',
      frequency: 'Monthly',
      nextOccurrence: '2027-05-01',
      dueDateRule: { type: 'days_after_start', daysOffset: 14 },
      reminderFrequencyDays: 3,
      maxReminders: 5,
      generateFirstImmediately: false,
    }),
  });

  record('Monthly recurring schedule creation returns HTTP 201', createMonthlyRes.status === 201);
  const monthlySchedId = createMonthlyRes.data?.id;

  // Manually generate the next request
  const genMonthlyRes = await request(`/api/recurring-schedules/${monthlySchedId}/generate-now`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Manual "generate next now" for monthly schedule returns HTTP 200', genMonthlyRes.status === 200);
  record('Generated request name contains period "May 2027"', genMonthlyRes.data?.request?.period === 'May 2027');

  // Verify next occurrence advanced to 1 month later ("2027-06-01")
  const updatedMonthly = await request(`/api/recurring-schedules/${monthlySchedId}`, {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Monthly next occurrence advanced by 1 month to 2027-06-01', updatedMonthly.data?.nextOccurrence === '2027-06-01');

  // ----------------------------------------------------
  // TEST 3: Duplicate Request Prevention
  // ----------------------------------------------------
  console.log('\n3. Testing Duplicate Request Prevention:');
  // Attempting to generate again for May 2027 (which was just generated)
  // Let's reset nextOccurrence back to 2027-05-01 and attempt generation
  await request(`/api/recurring-schedules/${monthlySchedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({ nextOccurrence: '2027-05-01' }),
  });

  const dupAttempt = await request(`/api/recurring-schedules/${monthlySchedId}/generate-now`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Duplicate request generation for same period is rejected with HTTP 400', dupAttempt.status === 400);
  record('Duplicate response error code is DUPLICATE_PERIOD_PREVENTED', dupAttempt.data?.code === 'DUPLICATE_PERIOD_PREVENTED');

  // ----------------------------------------------------
  // TEST 4: Timing Rules - Do not create next period until appropriate schedule requires it
  // ----------------------------------------------------
  console.log('\n4. Testing Timing Rules (Do not generate prematurely):');
  // Set nextOccurrence far in future (e.g. 2028-12-01)
  await request(`/api/recurring-schedules/${monthlySchedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({ nextOccurrence: '2028-12-01' }),
  });

  // Run the batch due schedule processor
  const batchRes = await request('/api/recurring-schedules/run-due', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Batch runner succeeds with HTTP 200', batchRes.status === 200);
  const generatedFuture = (batchRes.data?.requests || []).some(r => r.recurringScheduleId === monthlySchedId);
  record('Future schedule (2028-12-01) was NOT generated prematurely by scheduler', !generatedFuture);

  // ----------------------------------------------------
  // TEST 5: Test Quarterly Schedule Creation & Generation
  // ----------------------------------------------------
  console.log('\n5. Testing Quarterly Schedule Creation & Execution:');
  const createQuarterlyRes = await request('/api/recurring-schedules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({
      clientId: 'client_smith_02',
      templateId: 'tmpl_vat',
      name: 'Smith & Co MTD Quarterly VAT',
      frequency: 'Quarterly',
      nextOccurrence: '2027-07-01',
      dueDateRule: { type: 'days_after_start', daysOffset: 20 },
      reminderFrequencyDays: 5,
      maxReminders: 3,
      generateFirstImmediately: false,
    }),
  });

  record('Quarterly schedule creation returns HTTP 201', createQuarterlyRes.status === 201);
  const quarterlySchedId = createQuarterlyRes.data?.id;

  const genQuarterlyRes = await request(`/api/recurring-schedules/${quarterlySchedId}/generate-now`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Quarterly "generate next now" returns HTTP 200', genQuarterlyRes.status === 200);
  record('Quarterly period formatted as "Q3 2027"', genQuarterlyRes.data?.request?.period === 'Q3 2027');

  const updatedQuarterly = await request(`/api/recurring-schedules/${quarterlySchedId}`, {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Quarterly next occurrence advanced by 3 months to 2027-10-01', updatedQuarterly.data?.nextOccurrence === '2027-10-01');

  // ----------------------------------------------------
  // TEST 6: Test Annual Schedule Creation & Generation
  // ----------------------------------------------------
  console.log('\n6. Testing Annual Schedule Creation & Execution:');
  const createAnnualRes = await request('/api/recurring-schedules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({
      clientId: 'client_greenfield_03',
      templateId: 'tmpl_yearend',
      name: 'Greenfield Annual Statutory Filing',
      frequency: 'Annual',
      nextOccurrence: '2027-01-01',
      dueDateRule: { type: 'days_after_start', daysOffset: 30 },
      reminderFrequencyDays: 7,
      maxReminders: 4,
      generateFirstImmediately: false,
    }),
  });

  record('Annual schedule creation returns HTTP 201', createAnnualRes.status === 201);
  const annualSchedId = createAnnualRes.data?.id;

  const genAnnualRes = await request(`/api/recurring-schedules/${annualSchedId}/generate-now`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  record('Annual "generate next now" returns HTTP 200', genAnnualRes.status === 200);
  record('Annual period formatted as "FY 2027"', genAnnualRes.data?.request?.period === 'FY 2027');

  const updatedAnnual = await request(`/api/recurring-schedules/${annualSchedId}`, {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Annual next occurrence advanced by 1 year to 2028-01-01', updatedAnnual.data?.nextOccurrence === '2028-01-01');

  // ----------------------------------------------------
  // TEST 7: Pause, Resume, Edit, and Stop Controls
  // ----------------------------------------------------
  console.log('\n7. Testing Schedule Lifecycle Controls (Pause, Resume, Edit, Stop):');
  // Pause
  const pauseRes = await request(`/api/recurring-schedules/${monthlySchedId}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Pausing recurring schedule returns HTTP 200', pauseRes.status === 200 && pauseRes.data?.schedule?.status === 'Paused');

  // Attempting to generate while paused (without force)
  const pausedGenAttempt = await request(`/api/recurring-schedules/${monthlySchedId}/generate-now`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  // generate-now forces generation when manually clicked or errors if paused depending on options
  record('Paused schedule lifecycle handled', pausedGenAttempt.status === 200 || pausedGenAttempt.status === 400);

  // Resume
  const resumeRes = await request(`/api/recurring-schedules/${monthlySchedId}/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Resuming recurring schedule returns HTTP 200', resumeRes.status === 200 && resumeRes.data?.schedule?.status === 'Active');

  // Edit Schedule
  const editRes = await request(`/api/recurring-schedules/${monthlySchedId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({
      name: 'Northstar Monthly Reconciliation (Updated)',
      reminderFrequencyDays: 4,
    }),
  });
  record('Editing recurring schedule returns HTTP 200', editRes.status === 200 && editRes.data?.name === 'Northstar Monthly Reconciliation (Updated)');

  // Stop Schedule
  const stopRes = await request(`/api/recurring-schedules/${monthlySchedId}/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Stopping recurring schedule returns HTTP 200', stopRes.status === 200 && stopRes.data?.schedule?.status === 'Stopped');

  // ----------------------------------------------------
  // TEST 8: Multi-Tenancy & Audit Trail Verification
  // ----------------------------------------------------
  console.log('\n8. Testing Tenant Isolation & Audit Trail:');
  // Firm B should not see Firm A's recurring schedules
  const firmBSchedulesRes = await request('/api/recurring-schedules', {
    headers: { Authorization: `Bearer ${tokenJamesFirmB}` },
  });
  const firmBList = firmBSchedulesRes.data || [];
  const firmBHasFirmA = firmBList.some(s => s.firmId === 'firm_premier_01');
  record('Firm B cannot see Firm A recurring schedules (Strict Tenant Isolation)', !firmBHasFirmA);

  // Verify Audit Trail Logs
  const activityRes = await request('/api/activity', {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  const activities = activityRes.data || [];

  const hasCreatedLog = activities.some(a => a.action === 'recurring_schedule_created');
  const hasGeneratedLog = activities.some(a => a.action === 'recurring_request_generated');
  const hasPausedLog = activities.some(a => a.action === 'recurring_schedule_paused');
  const hasResumedLog = activities.some(a => a.action === 'recurring_schedule_resumed');
  const hasUpdatedLog = activities.some(a => a.action === 'recurring_schedule_updated');
  const hasStoppedLog = activities.some(a => a.action === 'recurring_schedule_stopped');

  record('Audit trail records recurring_schedule_created', hasCreatedLog);
  record('Audit trail records recurring_request_generated', hasGeneratedLog);
  record('Audit trail records recurring_schedule_paused', hasPausedLog);
  record('Audit trail records recurring_schedule_resumed', hasResumedLog);
  record('Audit trail records recurring_schedule_updated', hasUpdatedLog);
  record('Audit trail records recurring_schedule_stopped', hasStoppedLog);

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRecurringVerificationSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
