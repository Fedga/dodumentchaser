// Automated Security & Multi-Tenancy Verification Suite for DocumentChaser
import assert from 'assert';

const BASE_URL = 'http://127.0.0.1:3000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runSecurityAuditTests() {
  console.log('--- Starting DocumentChaser Security & Multi-Tenancy Test Suite ---');
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

  // Tokens:
  const tokenSarahAdminFirmA = 'token_sarah_admin_firm_a';
  const tokenAlexStaffFirmA = 'token_alex_staff_firm_a';
  const tokenJamesAdminFirmB = 'token_james_admin_firm_b';
  const invalidToken = 'token_completely_bogus_12345';

  // ----------------------------------------------------
  // TEST 1: Missing Authentication
  // ----------------------------------------------------
  console.log('\n1. Testing Missing & Invalid Authentication:');

  const test1a = await request('/api/me');
  record('Unauthenticated request to /api/me is blocked with 401', test1a.status === 401, `Status: ${test1a.status}`);

  const test1b = await request('/api/clients');
  record('Unauthenticated request to /api/clients is blocked with 401', test1b.status === 401, `Status: ${test1b.status}`);

  const test1c = await request('/api/requests');
  record('Unauthenticated request to /api/requests is blocked with 401', test1c.status === 401, `Status: ${test1c.status}`);

  const test1d = await request('/api/stats');
  record('Unauthenticated request to /api/stats is blocked with 401', test1d.status === 401, `Status: ${test1d.status}`);

  const test1e = await request('/api/clients', {
    headers: { Authorization: `Bearer ${invalidToken}` },
  });
  record('Request with invalid bearer token is rejected with 401', test1e.status === 401, `Status: ${test1e.status}`);

  // ----------------------------------------------------
  // TEST 2: Valid Authentication
  // ----------------------------------------------------
  console.log('\n2. Testing Valid Authentication:');

  const test2a = await request('/api/me', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record(
    'Sarah (Firm A Admin) authenticates successfully and retrieves correct firm',
    test2a.status === 200 && test2a.data?.user?.name === 'Sarah Jenkins FCA' && test2a.data?.firm?.id === 'firm_example_01',
    JSON.stringify(test2a.data)
  );

  const test2b = await request('/api/me', {
    headers: { Authorization: `Bearer ${tokenJamesAdminFirmB}` },
  });
  record(
    'James (Firm B Admin) authenticates successfully and retrieves Firm B',
    test2b.status === 200 && test2b.data?.user?.name === 'James Harrison CTA' && test2b.data?.firm?.id === 'firm_apex_02',
    JSON.stringify(test2b.data)
  );

  // ----------------------------------------------------
  // TEST 3: Cross-Tenant Isolation (Firm A vs Firm B)
  // ----------------------------------------------------
  console.log('\n3. Testing Multi-Tenant Data Isolation (Firm A cannot see or mutate Firm B):');

  // Query clients as Firm A
  const clientsFirmA = await request('/api/clients', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  const hasFirmBClientInFirmA = clientsFirmA.data.some(c => c.id === 'client_vanguard_b1' || c.firmId === 'firm_apex_02');
  record('Firm A clients list contains ZERO Firm B clients', clientsFirmA.status === 200 && !hasFirmBClientInFirmA);

  // Query clients as Firm B
  const clientsFirmB = await request('/api/clients', {
    headers: { Authorization: `Bearer ${tokenJamesAdminFirmB}` },
  });
  const hasFirmAClientInFirmB = clientsFirmB.data.some(c => c.id === 'client_abc_01' || c.firmId === 'firm_example_01');
  record('Firm B clients list contains ZERO Firm A clients', clientsFirmB.status === 200 && !hasFirmAClientInFirmB);

  // Direct ID cross-tenant query: Firm A user tries to get Firm B's client "client_vanguard_b1"
  const crossTenantClient = await request('/api/clients/client_vanguard_b1', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record('Firm A directly accessing Firm B client yields 404 Not Found', crossTenantClient.status === 404, `Status: ${crossTenantClient.status}`);

  // Direct ID cross-tenant mutation: Firm A user tries to update Firm B's client
  const crossTenantUpdate = await request('/api/clients/client_vanguard_b1', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Hacked Client' }),
  });
  record('Firm A updating Firm B client yields 404 Not Found', crossTenantUpdate.status === 404, `Status: ${crossTenantUpdate.status}`);

  // Cross-tenant request access: Firm A user tries to get Firm B's request "req_vanguard_q1tax"
  const crossTenantReq = await request('/api/requests/req_vanguard_q1tax', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record('Firm A accessing Firm B request yields 404 Not Found', crossTenantReq.status === 404, `Status: ${crossTenantReq.status}`);

  // Cross-tenant document query: Firm A documents list
  const docsFirmA = await request('/api/documents', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  const hasFirmBDocsInFirmA = docsFirmA.data.some(d => d.firmId === 'firm_apex_02');
  record('Firm A documents repository contains ZERO Firm B documents', docsFirmA.status === 200 && !hasFirmBDocsInFirmA);

  // ----------------------------------------------------
  // TEST 4: Invalid IDs
  // ----------------------------------------------------
  console.log('\n4. Testing Invalid IDs:');

  const invalidClient = await request('/api/clients/client_does_not_exist_9999', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record('Invalid client ID yields 404', invalidClient.status === 404);

  const invalidRequest = await request('/api/requests/req_does_not_exist_9999', {
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record('Invalid request ID yields 404', invalidRequest.status === 404);

  const invalidRequirementApprove = await request('/api/requirements/rq_does_not_exist/approve', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}` },
  });
  record('Invalid requirement ID yields 404', invalidRequirementApprove.status === 404);

  // ----------------------------------------------------
  // TEST 5: Role Restrictions (Admin vs Staff)
  // ----------------------------------------------------
  console.log('\n5. Testing Role-Based Access Control (Admin vs Staff):');

  // Alex is staff at Firm A
  // Staff tries to update Firm settings (Admin only)
  const staffFirmSettings = await request('/api/firm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenAlexStaffFirmA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Malicious Rename By Staff' }),
  });
  record('Staff user updating firm settings is blocked with 403 Forbidden', staffFirmSettings.status === 403, `Status: ${staffFirmSettings.status}`);

  // Admin tries to update Firm settings
  const adminFirmSettings = await request('/api/firm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahAdminFirmA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Example Accounting Ltd' }),
  });
  record('Admin user updating firm settings succeeds with 200 OK', adminFirmSettings.status === 200, `Status: ${adminFirmSettings.status}`);

  // Staff tries to delete a template (Admin only)
  const staffDeleteTemplate = await request('/api/templates/tmpl_bookkeeping', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenAlexStaffFirmA}` },
  });
  record('Staff user deleting template is blocked with 403 Forbidden', staffDeleteTemplate.status === 403, `Status: ${staffDeleteTemplate.status}`);

  // ----------------------------------------------------
  // TEST 6: Client Portal Isolation & Download Protection
  // ----------------------------------------------------
  console.log('\n6. Testing Client Portal Isolation & Direct Object Download Security:');

  // Unauthenticated caller tries to download doc_1 directly without session or portal token
  const unauthDownload = await fetch(`${BASE_URL}/api/documents/doc_1/download`);
  record('Unauthenticated direct document download is blocked with 403 Forbidden', unauthDownload.status === 403, `Status: ${unauthDownload.status}`);

  // Firm B accountant tries to download Firm A's document (doc_1)
  const crossTenantDownload = await fetch(`${BASE_URL}/api/documents/doc_1/download?token=${tokenJamesAdminFirmB}`);
  record('Cross-tenant accountant document download is blocked with 403 Forbidden', crossTenantDownload.status === 403, `Status: ${crossTenantDownload.status}`);

  // Firm A accountant downloads Firm A's document (doc_1)
  const firmADownload = await fetch(`${BASE_URL}/api/documents/doc_1/download?token=${tokenSarahAdminFirmA}`);
  record('Authorized accountant document download succeeds with 200 OK', firmADownload.status === 200, `Status: ${firmADownload.status}`);

  // Client with valid portal token for request 1 (portal_abc_march2027_sec9812) downloads doc_1
  const clientValidDownload = await fetch(`${BASE_URL}/api/documents/doc_1/download?portalToken=portal_abc_march2027_sec9812`);
  record('Client with valid portal token for their own request downloads file with 200 OK', clientValidDownload.status === 200, `Status: ${clientValidDownload.status}`);

  // Client with portal token for Request B tries to download doc_1 (belongs to Request A)
  const clientCrossReqDownload = await fetch(`${BASE_URL}/api/documents/doc_1/download?portalToken=portal_vanguard_q1tax_sec5512`);
  record('Client portal token from another request cannot download file (403 Forbidden)', clientCrossReqDownload.status === 403, `Status: ${clientCrossReqDownload.status}`);

  // Portal token accessing accountant dashboard route
  const portalAccessingAccountant = await request('/api/clients', {
    headers: { Authorization: `Bearer portal_abc_march2027_sec9812` },
  });
  record('Client portal token cannot access accountant API routes (401 Unauthorized)', portalAccessingAccountant.status === 401);

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityAuditTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
