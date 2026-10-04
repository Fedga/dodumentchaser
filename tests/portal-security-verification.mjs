// Comprehensive Portal Security Verification Suite for DocumentChaser
// Tests valid, invalid, expired, revoked, modified tokens, rate limiting, and cross-request scoping.

const BASE_URL = 'http://127.0.0.1:3000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json().catch(() => null);
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data,
  };
}

async function runPortalSecuritySuite() {
  console.log('================================================================');
  console.log('DocumentChaser Client Portal Security Verification Suite');
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

  const tokenSarahAdmin = 'token_sarah_admin_firm_a';

  // Step 0: Reset any rate limits from previous runs
  await request('/api/testing/reset-rate-limit', { method: 'POST' });

  // Step 1: Create a fresh request with a cryptographically secure token
  console.log('1. Setting up fresh request with cryptographic portal token...');
  const createRes = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahAdmin}`,
    },
    body: JSON.stringify({
      clientId: 'client_abc_01',
      name: 'Security Test Audit Pack',
      dueDate: '2027-05-01',
      requirements: [
        { name: 'Primary Bank Statement', required: true },
        { name: 'Company Credit Card Statement', required: true },
      ],
    }),
  });

  record('Request creation returns HTTP 201', createRes.status === 201, `Status: ${createRes.status}`);
  const createdReq = createRes.data;
  const initialToken = createdReq?.portalToken;
  const requestId = createdReq?.id;

  record(
    'Portal token is cryptographically random (256-bit entropy, prefixed with dcpt_)',
    Boolean(initialToken && initialToken.startsWith('dcpt_') && initialToken.length >= 64),
    `Token: ${initialToken}`
  );
  record(
    'Portal token does NOT contain client name or sensitive words',
    Boolean(initialToken && !initialToken.toLowerCase().includes('abc') && !initialToken.toLowerCase().includes('consulting')),
    `Token: ${initialToken}`
  );
  record(
    'Portal token hash is stored and non-empty',
    Boolean(createdReq?.portalTokenHash && createdReq.portalTokenHash.length === 64),
    `Hash: ${createdReq?.portalTokenHash}`
  );
  record(
    'Portal token expiration is configured',
    Boolean(createdReq?.portalTokenExpiresAt && new Date(createdReq.portalTokenExpiresAt) > new Date()),
    `ExpiresAt: ${createdReq?.portalTokenExpiresAt}`
  );

  // ----------------------------------------------------
  // TEST: Valid Token Access
  // ----------------------------------------------------
  console.log('\n2. Testing Valid Token Access:');
  const validAccess = await request(`/api/portal/${initialToken}`);
  record('Valid token grants access (HTTP 200)', validAccess.status === 200, `Status: ${validAccess.status}`);
  record('Valid response includes request details', validAccess.data?.request?.name === 'Security Test Audit Pack');
  record('Valid response includes practice details', validAccess.data?.firm?.name?.length > 0);
  record('Valid response includes client company name', validAccess.data?.client?.companyName === 'ABC Consulting Ltd');

  // Verify internal client ID is NOT exposed
  record(
    'Internal client ID and firm ID are NOT exposed in client portal response',
    validAccess.data?.client?.id === undefined && validAccess.data?.client?.firmId === undefined && validAccess.data?.client?.notes === undefined,
    `Client object: ${JSON.stringify(validAccess.data?.client)}`
  );

  // Verify portal access is logged in audit trail
  const activityRes = await request('/api/activity', {
    headers: { Authorization: `Bearer ${tokenSarahAdmin}` },
  });
  const portalAccessLogged = activityRes.data?.some(
    a => a.action === 'portal_accessed' && a.requestId === requestId
  );
  record('Portal access is recorded in practice audit log', Boolean(portalAccessLogged));

  // ----------------------------------------------------
  // TEST: Invalid Token Access
  // ----------------------------------------------------
  console.log('\n3. Testing Invalid Token:');
  const invalidToken = 'dcpt_0000000000000000000000000000000000000000000000000000000000000000';
  const invalidRes = await request(`/api/portal/${invalidToken}`);
  record('Invalid token is rejected with HTTP 404', invalidRes.status === 404, `Status: ${invalidRes.status}`);
  record('Invalid token returns PORTAL_LINK_INVALID code', invalidRes.data?.code === 'PORTAL_LINK_INVALID');

  // ----------------------------------------------------
  // TEST: Modified Token (Tampered Token)
  // ----------------------------------------------------
  console.log('\n4. Testing Modified/Tampered Token:');
  // Alter 1 character
  const modifiedToken = initialToken.slice(0, -1) + (initialToken.slice(-1) === 'a' ? 'b' : 'a');
  const modifiedRes = await request(`/api/portal/${modifiedToken}`);
  record('Modified/tampered token is rejected with HTTP 404', modifiedRes.status === 404, `Status: ${modifiedRes.status}`);

  // ----------------------------------------------------
  // TEST: Token Rotation
  // ----------------------------------------------------
  console.log('\n5. Testing Token Rotation:');
  const rotateRes = await request(`/api/requests/${requestId}/portal-token/rotate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahAdmin}`,
    },
    body: JSON.stringify({ expiresInDays: 14 }),
  });
  record('Accountant can rotate token (HTTP 200)', rotateRes.status === 200, `Status: ${rotateRes.status}`);
  const rotatedToken = rotateRes.data?.portalToken;
  record('Rotated token is different from initial token', rotatedToken !== initialToken, `New: ${rotatedToken}`);

  // Old token must now be invalid
  const oldTokenCheck = await request(`/api/portal/${initialToken}`);
  record('Previous token is immediately invalid after rotation (HTTP 404)', oldTokenCheck.status === 404, `Status: ${oldTokenCheck.status}`);

  // New rotated token must be valid
  const newTokenCheck = await request(`/api/portal/${rotatedToken}`);
  record('New rotated token provides valid access (HTTP 200)', newTokenCheck.status === 200, `Status: ${newTokenCheck.status}`);

  // ----------------------------------------------------
  // TEST: Token Revocation
  // ----------------------------------------------------
  console.log('\n6. Testing Token Revocation:');
  const revokeRes = await request(`/api/requests/${requestId}/portal-token/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahAdmin}` },
  });
  record('Accountant can revoke token (HTTP 200)', revokeRes.status === 200, `Status: ${revokeRes.status}`);

  // Revoked token access
  const revokedAccess = await request(`/api/portal/${rotatedToken}`);
  record('Revoked token is blocked with HTTP 403 Forbidden', revokedAccess.status === 403, `Status: ${revokedAccess.status}`);
  record('Revoked token returns PORTAL_LINK_REVOKED code', revokedAccess.data?.code === 'PORTAL_LINK_REVOKED');

  // Attempting upload with revoked token
  const revokedUpload = await request(`/api/portal/${rotatedToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: 'any_id',
      filename: 'test.pdf',
      fileDataUri: 'data:application/pdf;base64,JVBERi0xLg==',
    }),
  });
  record('Upload with revoked token is blocked (HTTP 403)', revokedUpload.status === 403);

  // ----------------------------------------------------
  // TEST: Token Expiration
  // ----------------------------------------------------
  console.log('\n7. Testing Expired Token:');
  // Rotate and re-activate with expired timestamp
  const reactivateRes = await request(`/api/requests/${requestId}/portal-token/rotate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahAdmin}`,
    },
    body: JSON.stringify({ expiresInDays: -1 }), // Negative days -> expired!
  });
  const expiredToken = reactivateRes.data?.portalToken;

  const expiredAccess = await request(`/api/portal/${expiredToken}`);
  record('Expired token is rejected with HTTP 410 Gone', expiredAccess.status === 410, `Status: ${expiredAccess.status}`);
  record('Expired token returns PORTAL_LINK_EXPIRED code', expiredAccess.data?.code === 'PORTAL_LINK_EXPIRED');

  // ----------------------------------------------------
  // TEST: Rate Limiting on Repeated Failed Attempts
  // ----------------------------------------------------
  console.log('\n8. Testing Rate Limiting (Brute-Force Enumeration Prevention):');
  // Reset rate limits first
  await request('/api/testing/reset-rate-limit', { method: 'POST' });

  // Send 5 failed attempts with bogus tokens
  for (let i = 1; i <= 5; i++) {
    await request(`/api/portal/bogus_probe_attempt_${i}`);
  }

  // 6th attempt should be blocked by rate limiter
  const blockedAttempt = await request('/api/portal/bogus_probe_attempt_6');
  record('6th consecutive failed attempt is blocked with HTTP 429 Too Many Requests', blockedAttempt.status === 429, `Status: ${blockedAttempt.status}`);
  record('Rate limited response returns RATE_LIMITED code', blockedAttempt.data?.code === 'RATE_LIMITED');
  record('Rate limited response includes Retry-After header', Boolean(blockedAttempt.headers['retry-after']));

  // Reset rate limit for next test
  await request('/api/testing/reset-rate-limit', { method: 'POST' });

  // ----------------------------------------------------
  // TEST: Cross-Request Scoping (Attempting to access another request)
  // ----------------------------------------------------
  console.log('\n9. Testing Request Scoping & Cross-Request Tampering:');
  // Rotate to get a fresh active token for Request 1
  const freshTokenRes = await request(`/api/requests/${requestId}/portal-token/rotate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahAdmin}`,
    },
    body: JSON.stringify({ expiresInDays: 30 }),
  });
  const activeTokenA = freshTokenRes.data?.portalToken;

  // Requirement belonging to ANOTHER request (e.g. req_greenfield_yearend requirement "rq_ye_1")
  const crossRequestUpload = await request(`/api/portal/${activeTokenA}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: 'tr_ye_1', // Belongs to different request!
      filename: 'malicious.pdf',
      fileDataUri: 'data:application/pdf;base64,JVBERi0xLg==',
    }),
  });
  record(
    'Attempting to upload to another request requirement is rejected (HTTP 404)',
    crossRequestUpload.status === 404,
    `Status: ${crossRequestUpload.status}`
  );

  const crossRequestMarkNA = await request(`/api/portal/${activeTokenA}/mark-na`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: 'tr_ye_1', // Belongs to different request!
      reason: 'Cross request injection attempt',
    }),
  });
  record(
    'Attempting to mark NA on another request requirement is rejected (HTTP 404)',
    crossRequestMarkNA.status === 404,
    `Status: ${crossRequestMarkNA.status}`
  );

  // ----------------------------------------------------
  // TEST: Client Actions Audit Trail Logging
  // ----------------------------------------------------
  console.log('\n10. Testing Client Action Audit Logging:');
  // Fetch requirements for active token A
  const portalDetails = await request(`/api/portal/${activeTokenA}`);
  const firstReqId = portalDetails.data?.requirements?.[0]?.id;

  if (firstReqId) {
    // Perform legitimate upload
    await request(`/api/portal/${activeTokenA}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requirementId: firstReqId,
        filename: 'bank_statement_april.pdf',
        fileDataUri: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCj4+CmVuZG9iag==',
      }),
    });

    const actCheck = await request('/api/activity', {
      headers: { Authorization: `Bearer ${tokenSarahAdmin}` },
    });
    const uploadLogged = actCheck.data?.some(
      a => a.action === 'document_uploaded' && a.requestId === requestId
    );
    record('Client document upload is recorded in practice audit log', Boolean(uploadLogged));
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPortalSecuritySuite().catch(err => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
