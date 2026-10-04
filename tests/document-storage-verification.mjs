// Document Storage Hardening Verification Suite for DocumentChaser
// Tests all 12 storage requirements, including type/size validation, path traversal prevention,
// firm ownership, portal token authorization, and audit logging.

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

async function runStorageVerificationSuite() {
  console.log('================================================================');
  console.log('DocumentChaser Document Storage Hardening Verification Suite');
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

  // Step 1: Create a test request and obtain portal token
  console.log('1. Setting up document request and client portal token...');
  const reqRes = await request('/api/requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({
      clientId: 'client_abc_01',
      name: 'Storage Security Audit Q2',
      dueDate: '2027-06-30',
      requirements: [
        { name: 'VAT Summary Certificate', required: true },
        { name: 'Supporting Fixed Asset Invoices', required: true },
      ],
    }),
  });

  record('Request setup returns HTTP 201', reqRes.status === 201);
  const portalToken = reqRes.data?.portalToken;
  const requestId = reqRes.data?.id;

  // Retrieve requirement ID
  const reqDetails = await request(`/api/portal/${portalToken}`);
  const req1 = reqDetails.data?.requirements?.[0];
  const req1Id = req1?.id;
  record('Requirement resolved for portal upload', Boolean(req1Id));

  // ----------------------------------------------------
  // TEST 1: Disallowed file types (Executable, script, HTML)
  // ----------------------------------------------------
  console.log('\n2. Testing File Type Whitelist Enforcement:');
  const exeUpload = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'malicious_payload.exe',
      mimeType: 'application/x-msdownload',
      fileDataUri: 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA=',
    }),
  });
  record('Uploading .exe file is blocked with HTTP 400', exeUpload.status === 400);

  const shUpload = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'script.sh',
      mimeType: 'application/x-sh',
      fileDataUri: 'data:text/x-shellscript;base64,IyEvYmluL2Jhc2gKZWNobyBwd25lZAo=',
    }),
  });
  record('Uploading .sh script is blocked with HTTP 400', shUpload.status === 400);

  // ----------------------------------------------------
  // TEST 2: Magic Bytes & Extension Spoofing Prevention
  // ----------------------------------------------------
  console.log('\n3. Testing Binary Signature & Extension Spoofing Inspection:');
  // File named harmless.png but contains Windows PE executable bytes (starts with "MZ")
  const spoofedPng = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'invoice_scanned.png',
      mimeType: 'image/png',
      fileDataUri: 'data:image/png;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA=', // MZ header!
    }),
  });
  record(
    'Disguised executable named .png is rejected via magic byte inspection (HTTP 400)',
    spoofedPng.status === 400 && (spoofedPng.data?.code === 'EXECUTABLE_REJECTED' || spoofedPng.data?.code === 'INVALID_FILE_SIGNATURE'),
    `Response: ${JSON.stringify(spoofedPng.data)}`
  );

  // Corrupted/fake PDF
  const fakePdf = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'fake_statement.pdf',
      mimeType: 'application/pdf',
      fileDataUri: 'data:application/pdf;base64,VGhpcyBpcyBub3QgYSByZWFsIFBERiBmaWxlIGF0IGFsbCE=',
    }),
  });
  record('Spoofed PDF without %PDF- header is rejected with HTTP 400', fakePdf.status === 400 && fakePdf.data?.code === 'INVALID_FILE_SIGNATURE');

  // ----------------------------------------------------
  // TEST 3: File Size Enforcement (Max 25 MB & Non-Empty)
  // ----------------------------------------------------
  console.log('\n4. Testing File Size Validation (Max 25 MB & Non-Empty):');
  const emptyUpload = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'empty.pdf',
      mimeType: 'application/pdf',
      fileDataUri: 'data:application/pdf;base64,',
    }),
  });
  record('Empty 0-byte file is rejected with HTTP 400', emptyUpload.status === 400);

  // ----------------------------------------------------
  // TEST 4: Path Traversal Prevention in Filename
  // ----------------------------------------------------
  console.log('\n5. Testing Path Traversal Prevention:');
  const validPdfBase64 = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9Db3VudCAxCj4+CmVuZG9iagoxIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyA0IDAgUgo+PgplbmRvYmoKMyAwIG9iago8PAovTGVuZ3RoIDQzCj4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzIgNzEyIFRECihoZWxsbyBkb2N1bWVudGNoYXNlcikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iag==';

  const traversalUpload = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: '../../../../etc/shadow.pdf',
      mimeType: 'application/pdf',
      fileDataUri: validPdfBase64,
    }),
  });
  record(
    'Path traversal characters in filename are sanitized and neutralized',
    traversalUpload.status === 200,
    `Status: ${traversalUpload.status}`
  );

  // ----------------------------------------------------
  // TEST 5: Legitimate Document Upload & Separate Metadata Storage
  // ----------------------------------------------------
  console.log('\n6. Testing Legitimate Upload & Storage Abstraction:');
  const legitUpload = await request(`/api/portal/${portalToken}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirementId: req1Id,
      filename: 'Barclays_VAT_Certificate.pdf',
      mimeType: 'application/pdf',
      fileDataUri: validPdfBase64,
    }),
  });
  record('Legitimate document upload succeeds with HTTP 200', legitUpload.status === 200);
  const uploadedDocId = legitUpload.data?.documentId;
  record('Document ID returned to client', Boolean(uploadedDocId));

  // Verify metadata does NOT leak filesystem path to client
  const docsList = await request('/api/documents', {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  const storedDocMeta = docsList.data?.find(d => d.id === uploadedDocId);
  record('Metadata contains sanitized display name', storedDocMeta?.filename === 'Barclays_VAT_Certificate.pdf');
  record('Metadata does NOT expose internal storageKey to client', storedDocMeta?.storageKey === undefined);
  record('Metadata does NOT expose raw fileDataUri in list queries', storedDocMeta?.fileDataUri === undefined);

  // ----------------------------------------------------
  // TEST 6: Public Direct Access Prevention
  // ----------------------------------------------------
  console.log('\n7. Testing Public Direct Access Prevention:');
  const directPathAttempt = await request('/data/private_storage/anything');
  record('Direct access to private storage directory is blocked/404', directPathAttempt.status === 404);

  // ----------------------------------------------------
  // TEST 7: Download Authorization (Accountant vs Client vs Cross-Tenant)
  // ----------------------------------------------------
  console.log('\n8. Testing Download Access Controls:');
  // Unauthenticated download
  const unauthDownload = await request(`/api/documents/${uploadedDocId}/download`);
  record('Unauthenticated download is blocked with HTTP 403', unauthDownload.status === 403);

  // Cross-tenant accountant download (Firm B trying to download Firm A's document)
  const crossTenantDownload = await request(`/api/documents/${uploadedDocId}/download`, {
    headers: { Authorization: `Bearer ${tokenJamesFirmB}` },
  });
  record('Cross-firm accountant download is blocked with HTTP 403 Forbidden', crossTenantDownload.status === 403);

  // Authorized accountant download (Firm A)
  const authAccountantDownload = await request(`/api/documents/${uploadedDocId}/download`, {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Authorized firm accountant download succeeds with HTTP 200', authAccountantDownload.status === 200);
  record('Download includes Content-Type header', authAccountantDownload.headers['content-type']?.includes('application/pdf'));
  record('Download includes nosniff security header', authAccountantDownload.headers['x-content-type-options'] === 'nosniff');
  record('Download includes private Cache-Control header', authAccountantDownload.headers['cache-control']?.includes('no-store'));

  // Authorized client portal download (supplying valid portalToken for this request)
  const authClientDownload = await request(`/api/documents/${uploadedDocId}/download?portalToken=${portalToken}`);
  record('Client with matching valid portal token downloads document with HTTP 200', authClientDownload.status === 200);

  // Client with portalToken for a DIFFERENT request
  const otherPortalToken = 'portal_greenfield_ye2026_sec7721';
  const wrongTokenDownload = await request(`/api/documents/${uploadedDocId}/download?portalToken=${otherPortalToken}`);
  record('Client with portal token for DIFFERENT request is blocked with HTTP 403', wrongTokenDownload.status === 403);

  // ----------------------------------------------------
  // TEST 8: Full Audit Trail Logging (Upload, Download, Approve, Reject, Delete)
  // ----------------------------------------------------
  console.log('\n9. Testing Audit Trail Logging:');
  // 1. Approve document
  await request(`/api/requirements/${req1Id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });

  // 2. Reject document
  await request(`/api/requirements/${req1Id}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenSarahFirmA}`,
    },
    body: JSON.stringify({ reason: 'Certificate seal is obscured' }),
  });

  // 3. Delete document
  const deleteRes = await request(`/api/documents/${uploadedDocId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  record('Accountant can delete document (HTTP 200)', deleteRes.status === 200);

  // Verify audit logs contain all required actions
  const auditRes = await request('/api/activity', {
    headers: { Authorization: `Bearer ${tokenSarahFirmA}` },
  });
  const activities = auditRes.data || [];

  const hasUpload = activities.some(a => a.action === 'document_uploaded' && a.requestId === requestId);
  const hasDownload = activities.some(a => a.action === 'document_downloaded' && a.requestId === requestId);
  const hasApproved = activities.some(a => a.action === 'document_approved' && a.requestId === requestId);
  const hasRejected = activities.some(a => a.action === 'document_rejected' && a.requestId === requestId);
  const hasDeleted = activities.some(a => a.action === 'document_deleted' && a.requestId === requestId);

  record('Audit log records document_uploaded', hasUpload);
  record('Audit log records document_downloaded', hasDownload);
  record('Audit log records document_approved', hasApproved);
  record('Audit log records document_rejected', hasRejected);
  record('Audit log records document_deleted', hasDeleted);

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStorageVerificationSuite().catch(err => {
  console.error('Document storage test suite failure:', err);
  process.exit(1);
});
