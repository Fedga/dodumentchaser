// Automated Verification Suite for Production-Ready Document Chasing Engine
// Tests core formula (required - approved = missing), workflow transitions,
// pause/resume, max reminders, idempotency, upload & completion transitions, and audit logs.

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

async function runChasingEngineVerificationSuite() {
  console.log('================================================================');
  console.log('DocumentChaser Document Chasing Engine Verification Suite');
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

  // ----------------------------------------------------
  // TEST 1: INCOMPLETE REQUEST & ONLY MISSING REQUIRED DOCUMENTS INCLUDED
  // ----------------------------------------------------
  console.log('1. Setting up fresh request with required & non-required documents:');
  const reqRes = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      clientId: 'client_abc_01',
      name: 'Chasing Engine Audit 2027',
      period: 'Q2 2027',
      dueDate: '2027-05-15',
      reminderFrequencyDays: 3,
      maxReminders: 3,
      requirements: [
        { name: 'Director Passport Photo ID', required: true },
        { name: 'Commercial Lease Agreement', required: true },
        { name: 'Optional Marketing Flyer', required: false }, // NON-REQUIRED: must not be chased!
      ],
    }),
  });

  record('Request setup returns HTTP 201', reqRes.status === 201);
  const testReqId = reqRes.data?.id;
  const portalToken = reqRes.data?.portalToken;

  // Retrieve requirement IDs
  const reqDetails = await request(`/api/portal/${portalToken}`);
  const reqItems = reqDetails.data?.requirements || [];
  const reqPassport = reqItems.find(r => r.name.includes('Passport'));
  const reqLease = reqItems.find(r => r.name.includes('Lease'));
  const reqFlyer = reqItems.find(r => r.name.includes('Flyer'));

  record('Passport requirement found', Boolean(reqPassport));
  record('Lease requirement found', Boolean(reqLease));
  record('Optional flyer found', Boolean(reqFlyer));

  console.log('\n2. Testing Incomplete Request & Reminder Dispatch (Only Missing Required Included):');
  const reminder1Res = await request(`/api/requests/${testReqId}/send-chaser`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ idempotencyKey: 'job_cycle_q2_chase_1' }),
  });

  record('First reminder dispatch succeeds (HTTP 200)', reminder1Res.status === 200);
  record('First reminder returned sent: true', reminder1Res.data?.sent === true);
  record('Reminder number is 1', reminder1Res.data?.reminder?.reminderNumber === 1);
  record('Missing documents contains Passport', reminder1Res.data?.missingDocuments?.includes('Director Photo ID') || reminder1Res.data?.missingDocuments?.some(d => d.includes('Passport')));
  record('Missing documents contains Lease Agreement', reminder1Res.data?.missingDocuments?.some(d => d.includes('Lease')));
  record('NON-REQUIRED item is EXCLUDED from reminder', !reminder1Res.data?.missingDocuments?.some(d => d.includes('Flyer')));
  record('Reminder recorded with deliveryStatus (simulated/sent)', Boolean(reminder1Res.data?.reminder?.deliveryStatus));
  record('Reminder recorded with timestamp', Boolean(reminder1Res.data?.reminder?.sentAt));

  // ----------------------------------------------------
  // TEST 2: IDEMPOTENCY & DUPLICATE JOB EXECUTION
  // ----------------------------------------------------
  console.log('\n3. Testing Idempotency & Duplicate Job Execution:');
  const duplicateAttempt = await request(`/api/requests/${testReqId}/send-chaser`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ idempotencyKey: 'job_cycle_q2_chase_1' }),
  });

  // Re-executing with the same idempotency key triggers the idempotency duplicate prevention guard
  record(
    'Duplicate execution handled cleanly without duplicate reminder generation',
    duplicateAttempt.status === 200 && (duplicateAttempt.data?.sent === false || duplicateAttempt.data?.reason === 'DUPLICATE_JOB_EXECUTION_PREVENTED')
  );

  // ----------------------------------------------------
  // TEST 3: PAUSED REMINDERS
  // ----------------------------------------------------
  console.log('\n4. Testing Paused Reminders:');
  const pauseRes = await request(`/api/requests/${testReqId}/pause-reminders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  record('Pausing reminders returns HTTP 200', pauseRes.status === 200 && pauseRes.data?.remindersPaused === true);

  // Verify chasing engine skips paused request
  const pausedEvaluation = await request(`/api/reminders`, {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  const queueItem = (pausedEvaluation.data?.queue || []).find(q => q.requestId === testReqId);
  record('Queue reflects paused status', queueItem?.status === 'Paused');

  // ----------------------------------------------------
  // TEST 4: RESUMED REMINDERS
  // ----------------------------------------------------
  console.log('\n5. Testing Resumed Reminders:');
  const resumeRes = await request(`/api/requests/${testReqId}/resume-reminders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  record('Resuming reminders returns HTTP 200', resumeRes.status === 200 && resumeRes.data?.remindersPaused === false);

  // ----------------------------------------------------
  // TEST 5: MAXIMUM REMINDERS REACHED
  // ----------------------------------------------------
  console.log('\n6. Testing Maximum Reminders Reached:');
  // Update request to maxReminders = 1
  await request(`/api/requests/${testReqId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ maxReminders: 1, remindersPaused: false }),
  });

  const maxRes = await request(`/api/requests/${testReqId}/send-chaser`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  record(
    'Max reminders reached blocks further reminders',
    maxRes.status === 200 && maxRes.data?.sent === false && maxRes.data?.reason === 'MAX_REMINDERS_REACHED'
  );

  // ----------------------------------------------------
  // TEST 6: CLIENT UPLOADS DOCUMENT AFTER REMINDER (MISSING LIST SHRINKS)
  // ----------------------------------------------------
  console.log('\n7. Testing Client Upload After Reminder:');
  // Reset maxReminders so we can test the next reminder missing list
  await request(`/api/requests/${testReqId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({ maxReminders: 5, remindersPaused: false }),
  });

  const validPdf = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCj4+CmVuZG9iagoxIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyA0IDAgUgo+PgplbmRvYmoKMyAwIG9iago8PAovTGVuZ3RoIDQzCj4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzIgNzEyIFRECihoZWxsbyBkb2N1bWVudGNoYXNlcikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iag==';

  // Client uploads Passport
  const uploadRes = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: reqPassport.id,
      filename: 'passport_scan.pdf',
      mimeType: 'application/pdf',
      fileDataUri: validPdf,
    }),
  });
  record('Client uploads first required document (HTTP 200)', uploadRes.status === 200);

  // Accountant approves Passport
  const approveRes = await request(`/api/requirements/${reqPassport.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  record('Accountant approves first document (HTTP 200)', approveRes.status === 200);

  // Now trigger reminder #2: Only Lease Agreement should remain!
  const reminder2Res = await request(`/api/requests/${testReqId}/send-chaser`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  record('Reminder #2 sent successfully', reminder2Res.data?.sent === true);
  record('Reminder number is 2', reminder2Res.data?.reminder?.reminderNumber === 2);
  record('Approved Passport is no longer in missing documents', !reminder2Res.data?.missingDocuments?.some(d => d.includes('Passport')));
  record('Remaining missing required document (Lease) is included', reminder2Res.data?.missingDocuments?.some(d => d.includes('Lease')));

  // ----------------------------------------------------
  // TEST 7: ALL REQUIRED DOCUMENTS APPROVED → AUTOMATIC COMPLETION
  // ----------------------------------------------------
  console.log('\n8. Testing All Documents Approved → Automatic Completion & Reminder Stopping:');
  // Client uploads Lease Agreement
  await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: reqLease.id,
      filename: 'commercial_lease_final.pdf',
      mimeType: 'application/pdf',
      fileDataUri: validPdf,
    }),
  });

  // Accountant approves Lease Agreement
  await request(`/api/requirements/${reqLease.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  // Verify request is automatically marked Complete
  const completedReq = await request(`/api/requests/${testReqId}`, {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  record('Request status automatically updated to "Completed"', completedReq.data?.status === 'Completed');
  record('Request completedAt timestamp recorded', Boolean(completedReq.data?.completedAt));
  record('Reminders automatically stopped (remindersPaused = true)', completedReq.data?.remindersPaused === true);

  // Attempt to chase a completed request
  const chaseCompleted = await request(`/api/requests/${testReqId}/send-chaser`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });

  record(
    'No reminders sent once request is completed',
    chaseCompleted.data?.sent === false && chaseCompleted.data?.reason === 'ALL_REQUIRED_DOCUMENTS_APPROVED'
  );

  // ----------------------------------------------------
  // TEST 8: OVERDUE REQUEST WORKFLOW
  // ----------------------------------------------------
  console.log('\n9. Testing Overdue Request Transition:');
  const overdueSetup = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarah}`,
    },
    body: JSON.stringify({
      clientId: 'client_smith_02',
      name: 'Overdue VAT Test',
      period: 'Q1 2026',
      dueDate: '2026-01-01', // Date in the past!
      reminderFrequencyDays: 1,
      maxReminders: 5,
      requirements: [{ name: 'Overdue Bank Statement', required: true }],
    }),
  });

  const overdueReqId = overdueSetup.data?.id;

  // Run batch chasing engine
  const batchRunRes = await request('/api/chasing/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  record('Batch chasing engine runs successfully (HTTP 200)', batchRunRes.status === 200);

  const overdueCheck = await request(`/api/requests/${overdueReqId}`, {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  record('Past-due incomplete request transitioned to "Overdue"', overdueCheck.data?.status === 'Overdue');

  // ----------------------------------------------------
  // TEST 9: AUDIT TRAIL LOGGING
  // ----------------------------------------------------
  console.log('\n10. Testing Audit Trail Completeness:');
  const activityRes = await request('/api/activity', {
    headers: { Authorization: `Bearer ${tokenSarah}` },
  });
  const activities = activityRes.data || [];

  const hasReminderSent = activities.some(a => a.action === 'reminder_sent' && a.requestId === testReqId);
  const hasRequestCompleted = activities.some(a => a.action === 'request_completed' && a.requestId === testReqId);
  const hasPaused = activities.some(a => a.action === 'reminders_paused' && a.requestId === testReqId);
  const hasResumed = activities.some(a => a.action === 'reminders_resumed' && a.requestId === testReqId);

  record('Audit trail records reminder_sent with details', hasReminderSent);
  record('Audit trail records request_completed upon approval of all required documents', hasRequestCompleted);
  record('Audit trail records reminders_paused', hasPaused);
  record('Audit trail records reminders_resumed', hasResumed);

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runChasingEngineVerificationSuite().catch(err => {
  console.error('Chasing engine verification failed:', err);
  process.exit(1);
});
