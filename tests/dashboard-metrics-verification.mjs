// tests/dashboard-metrics-verification.mjs
// Verification of dynamic database metrics calculation and tenant isolation

import assert from 'assert';

const BASE_URL = 'http://localhost:3000';
const FIRM_A_TOKEN = 'token_sarah_admin_firm_a';
const FIRM_B_TOKEN = 'token_james_admin_firm_b';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function asyncIt(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== DocumentChaser Dashboard Dynamic Metrics & Tenant Isolation Tests ===\n');

  // Test 1: Fetch stats for Firm A and verify all required keys exist
  let firmAStats;
  await asyncIt('Firm A /api/stats returns all 9 specified metrics dynamically', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, 'Expected status 200');
    firmAStats = await res.json();

    assert('totalActiveClients' in firmAStats, 'totalActiveClients must be present');
    assert('outstandingRequests' in firmAStats, 'outstandingRequests must be present');
    assert('documentsAwaitingClient' in firmAStats, 'documentsAwaitingClient must be present');
    assert('completedThisMonth' in firmAStats, 'completedThisMonth must be present');
    assert('overdueRequests' in firmAStats, 'overdueRequests must be present');
    assert('documentsCollectedThisMonth' in firmAStats, 'documentsCollectedThisMonth must be present');
    assert('requestsCompletedThisMonth' in firmAStats, 'requestsCompletedThisMonth must be present');
    assert('automatedRemindersSent' in firmAStats, 'automatedRemindersSent must be present');
    assert('clientsCurrentlyBeingChased' in firmAStats, 'clientsCurrentlyBeingChased must be present');

    assert.strictEqual(typeof firmAStats.totalActiveClients, 'number', 'totalActiveClients must be a number');
    assert.strictEqual(typeof firmAStats.outstandingRequests, 'number', 'outstandingRequests must be a number');
    assert.strictEqual(typeof firmAStats.documentsAwaitingClient, 'number', 'documentsAwaitingClient must be a number');
    assert.strictEqual(typeof firmAStats.completedThisMonth, 'number', 'completedThisMonth must be a number');
    assert.strictEqual(typeof firmAStats.overdueRequests, 'number', 'overdueRequests must be a number');
    assert.strictEqual(typeof firmAStats.documentsCollectedThisMonth, 'number', 'documentsCollectedThisMonth must be a number');
    assert.strictEqual(typeof firmAStats.requestsCompletedThisMonth, 'number', 'requestsCompletedThisMonth must be a number');
    assert.strictEqual(typeof firmAStats.automatedRemindersSent, 'number', 'automatedRemindersSent must be a number');
    assert.strictEqual(typeof firmAStats.clientsCurrentlyBeingChased, 'number', 'clientsCurrentlyBeingChased must be a number');
  });

  // Test 2: Fetch stats for Firm B and verify strict tenant isolation
  let firmBStats;
  await asyncIt('Firm B /api/stats returns distinct tenant-isolated metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_B_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, 'Expected status 200');
    firmBStats = await res.json();

    // Verify Firm B only has its own clients and requests
    assert.strictEqual(firmBStats.totalActiveClients, 2, 'Firm B has exactly 2 active clients');
    assert.strictEqual(firmBStats.outstandingRequests, 1, 'Firm B has exactly 1 outstanding request');
    assert.strictEqual(firmBStats.documentsAwaitingClient, 1, 'Firm B has exactly 1 missing document');
    assert.strictEqual(firmBStats.overdueRequests, 0, 'Firm B has 0 overdue requests');
    assert.strictEqual(firmBStats.automatedRemindersSent, 0, 'Firm B has 0 automated reminders sent');

    // Firm A and Firm B numbers must not match blindly
    assert.notStrictEqual(firmAStats.totalActiveClients, firmBStats.totalActiveClients, 'Tenant isolation: client counts differ');
    assert.notStrictEqual(firmAStats.outstandingRequests, firmBStats.outstandingRequests, 'Tenant isolation: outstanding requests differ');
  });

  // Test 3: Dynamic Calculation - Create a new request in Firm A and verify metrics increment dynamically
  await asyncIt('Creating a new request dynamically increments outstandingRequests & documentsAwaitingClient', async () => {
    const initialOutstanding = firmAStats.outstandingRequests;
    const initialMissing = firmAStats.documentsAwaitingClient;

    // Create a new request with 2 required missing documents
    const createRes = await fetch(`${BASE_URL}/api/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRM_A_TOKEN}`,
      },
      body: JSON.stringify({
        clientId: 'client_abc_01',
        name: 'Dynamic Test Request ' + Date.now(),
        period: 'Q3 2026',
        dueDate: '2026-11-30',
        requirements: [
          { name: 'Bank Statement Oct 2026', description: 'PDF format', required: true },
          { name: 'VAT Return Summary', description: 'HMRC return', required: true },
        ],
      }),
    });
    assert.strictEqual(createRes.status, 201, 'Request creation should return 201');
    const createdReq = await createRes.json();

    // Re-fetch stats
    const afterRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const afterStats = await afterRes.json();

    assert.strictEqual(
      afterStats.outstandingRequests,
      initialOutstanding + 1,
      'outstandingRequests should have dynamically incremented by 1'
    );
    assert.strictEqual(
      afterStats.documentsAwaitingClient,
      initialMissing + 2,
      'documentsAwaitingClient should have dynamically incremented by 2'
    );

    // Verify Firm B's stats were NOT affected (tenant isolation!)
    const bCheckRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_B_TOKEN}` },
    });
    const bCheckStats = await bCheckRes.json();
    assert.strictEqual(bCheckStats.outstandingRequests, firmBStats.outstandingRequests, 'Firm B outstandingRequests unaffected');
    assert.strictEqual(bCheckStats.documentsAwaitingClient, firmBStats.documentsAwaitingClient, 'Firm B missing docs unaffected');
  });

  // Test 4: Dynamic Calculation - Creating an active client increments totalActiveClients
  await asyncIt('Adding a new client dynamically increments totalActiveClients', async () => {
    // Current count
    const beforeRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const beforeStats = await beforeRes.json();

    const clientRes = await fetch(`${BASE_URL}/api/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRM_A_TOKEN}`,
      },
      body: JSON.stringify({
        name: 'Charlotte Brontë',
        companyName: 'Brontë Enterprises Ltd ' + Date.now(),
        email: `charlotte_${Date.now()}@bronte.co.uk`,
        phone: '+44 1422 123456',
        status: 'Active',
      }),
    });
    assert.strictEqual(clientRes.status, 201, 'Client creation should return 201');

    const afterRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const afterStats = await afterRes.json();
    assert.strictEqual(
      afterStats.totalActiveClients,
      beforeStats.totalActiveClients + 1,
      'totalActiveClients must dynamically increment'
    );
  });

  // Test 5: Verify filtered views match dashboard metric definitions
  await asyncIt('Filtered view queries match dashboard metric contracts', async () => {
    // Missing filter: requests?status=Missing
    const missingRes = await fetch(`${BASE_URL}/api/requests?status=Missing`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const missingRequests = await missingRes.json();
    assert(Array.isArray(missingRequests), 'Should return an array');
    for (const req of missingRequests) {
      assert(
        req.status === 'Active' || req.status === 'Overdue',
        'Missing requests filter must only return active or overdue requests'
      );
      assert(
        (req.stats?.missingCount || 0) > 0,
        'Missing requests filter must only return requests with missingCount > 0'
      );
    }

    // Overdue filter: requests?status=Overdue
    const overdueRes = await fetch(`${BASE_URL}/api/requests?status=Overdue`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const overdueRequests = await overdueRes.json();
    assert(Array.isArray(overdueRequests), 'Should return an array');
    for (const req of overdueRequests) {
      assert.strictEqual(req.status, 'Overdue', 'Overdue filter must only return Overdue status');
    }

    // Completed filter: requests?status=Completed
    const completedRes = await fetch(`${BASE_URL}/api/requests?status=Completed`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const completedRequests = await completedRes.json();
    assert(Array.isArray(completedRequests), 'Should return an array');
    for (const req of completedRequests) {
      assert.strictEqual(req.status, 'Completed', 'Completed filter must only return Completed status');
    }
  });

  // Test 6: Chasing Insights Factual Metrics
  await asyncIt('Chasing Insights returns all 5 factual metrics dynamically', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const data = await res.json();

    assert('remindersSent' in data, 'remindersSent must be present');
    assert('documentsCollected' in data, 'documentsCollected must be present');
    assert('requestsCompleted' in data, 'requestsCompleted must be present');
    assert('averageRequestCompletionTime' in data, 'averageRequestCompletionTime must be present');
    assert('averageRemindersPerCompletedRequest' in data, 'averageRemindersPerCompletedRequest must be present');

    assert.strictEqual(typeof data.remindersSent, 'number', 'remindersSent is a number');
    assert.strictEqual(typeof data.documentsCollected, 'number', 'documentsCollected is a number');
    assert.strictEqual(typeof data.requestsCompleted, 'number', 'requestsCompleted is a number');
    assert.strictEqual(typeof data.averageRequestCompletionTime, 'string', 'averageRequestCompletionTime is a string');
    assert.strictEqual(typeof data.averageRemindersPerCompletedRequest, 'number', 'averageRemindersPerCompletedRequest is a number');

    assert(data.remindersSent >= 0, 'remindersSent >= 0');
    assert(data.documentsCollected >= 0, 'documentsCollected >= 0');
    assert(data.requestsCompleted >= 0, 'requestsCompleted >= 0');
  });

  // Test 7: Estimated Manual Chasing Time Avoided Metric Calculation
  await asyncIt('Estimated manual chasing time avoided is calculated accurately from formula', async () => {
    const res = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const data = await res.json();

    assert('automaticallyResolvedInteractions' in data, 'automaticallyResolvedInteractions present');
    assert('configuredMinutesPerDocument' in data, 'configuredMinutesPerDocument present');
    assert('estimatedMinutesSaved' in data, 'estimatedMinutesSaved present');
    assert('estimatedHoursSaved' in data, 'estimatedHoursSaved present');

    const expectedMinutes = data.automaticallyResolvedInteractions * data.configuredMinutesPerDocument;
    assert.strictEqual(
      data.estimatedMinutesSaved,
      expectedMinutes,
      `estimatedMinutesSaved (${data.estimatedMinutesSaved}) must equal interactions (${data.automaticallyResolvedInteractions}) × configuredMinutes (${data.configuredMinutesPerDocument})`
    );

    const expectedHours = Math.round((expectedMinutes / 60) * 10) / 10;
    assert.strictEqual(
      data.estimatedHoursSaved,
      expectedHours,
      `estimatedHoursSaved (${data.estimatedHoursSaved}) must equal Math.round(minutes/60 * 10) / 10 (${expectedHours})`
    );
  });

  // Test 8: Configure Estimated Minutes per Missing Document
  await asyncIt('Firm can configure estimated minutes and see metrics recalculate dynamically', async () => {
    // 1. Set to 12 minutes
    const updateRes = await fetch(`${BASE_URL}/api/firm/chasing-estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRM_A_TOKEN}`,
      },
      body: JSON.stringify({ minutes: 12 }),
    });
    assert.strictEqual(updateRes.status, 200, 'Updating estimate baseline should return 200');
    const updateBody = await updateRes.json();
    assert.strictEqual(updateBody.manualChasingMinutesPerDoc, 12, 'manualChasingMinutesPerDoc updated to 12');

    // 2. Fetch stats and verify recalculation
    const statsRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const statsData = await statsRes.json();
    assert.strictEqual(statsData.configuredMinutesPerDocument, 12, 'configuredMinutesPerDocument is 12');
    const expectedMinutes12 = statsData.automaticallyResolvedInteractions * 12;
    assert.strictEqual(statsData.estimatedMinutesSaved, expectedMinutes12, 'recalculated with 12 minutes');

    // 3. Reset back to default 5 minutes
    const resetRes = await fetch(`${BASE_URL}/api/firm/chasing-estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRM_A_TOKEN}`,
      },
      body: JSON.stringify({ minutes: 5 }),
    });
    assert.strictEqual(resetRes.status, 200);
    const resetBody = await resetRes.json();
    assert.strictEqual(resetBody.manualChasingMinutesPerDoc, 5, 'Reset back to default 5 minutes');

    // Verify stats return to 5 mins
    const finalStatsRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Authorization: `Bearer ${FIRM_A_TOKEN}` },
    });
    const finalStats = await finalStatsRes.json();
    assert.strictEqual(finalStats.configuredMinutesPerDocument, 5, 'configuredMinutesPerDocument is 5');
  });

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
