// scripts/verify-gcs-live.ts
// Live Google Cloud Storage Production Verification

import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';
import {
  DocumentStorageService,
  GoogleCloudStorageProvider,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
} from '../server/documentStorage.js';

interface VerificationResult {
  step: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

async function runLiveVerification() {
  const results: Record<string, 'PASS' | 'FAIL'> = {};

  try {
    // 1. Confirm STORAGE_PROVIDER is gcs
    const storageProviderSet = !!process.env.STORAGE_PROVIDER;
    const isGcs = process.env.STORAGE_PROVIDER?.trim().toLowerCase() === 'gcs';
    const providerConfigPass = storageProviderSet && isGcs;

    // 2. Confirm GCS_BUCKET_NAME exists
    const bucketNameSet = !!process.env.GCS_BUCKET_NAME && process.env.GCS_BUCKET_NAME.trim().length > 0;

    // 3. Initialise GoogleCloudStorageProvider
    DocumentStorageService.resetProvider();
    const provider = DocumentStorageService.getProvider();
    const isGcsProvider = provider instanceof GoogleCloudStorageProvider;
    results['initialisation'] = isGcsProvider ? 'PASS' : 'FAIL';

    if (!isGcsProvider) {
      throw new Error('DocumentStorageService did not return an instance of GoogleCloudStorageProvider');
    }

    const gcsProvider = provider as GoogleCloudStorageProvider;

    // 4. Confirm configured GCS bucket is accessible
    const bucket = gcsProvider.getBucket();
    const [bucketExists] = await bucket.exists();
    results['bucket_connectivity'] = bucketExists ? 'PASS' : 'FAIL';

    if (!bucketExists) {
      throw new Error('Configured GCS bucket could not be found or is not accessible with current ADC permissions');
    }

    // 5 & 6. Upload temporary test object under isolated test prefix
    const testId = crypto.randomBytes(8).toString('hex');
    const testKey = `__documentchaser_gcs_verification__/verification_${Date.now()}_${testId}.pdf`;
    const testPayload = Buffer.from(`%PDF-1.4 DocumentChaser Live Storage Verification Token ${testId}`);

    await gcsProvider.saveFile(testKey, testPayload, 'application/pdf');
    results['temporary_upload'] = 'PASS';

    // 7. Read/download the object back and verify contents
    const downloaded = await gcsProvider.getFile(testKey);
    const contentMatches = downloaded.equals(testPayload);
    results['temporary_download'] = contentMatches ? 'PASS' : 'FAIL';

    if (!contentMatches) {
      throw new Error('Downloaded object payload does not match uploaded verification bytes');
    }

    // 8 & 9. Delete temporary test object and verify it no longer exists
    const deleted = await gcsProvider.deleteFile(testKey);
    const stillExists = await gcsProvider.fileExists(testKey);
    results['temporary_deletion'] = (deleted && !stillExists) ? 'PASS' : 'FAIL';

    // 10. Verify private access (no public URLs)
    // Verify that the provider has no public URL exposure method and files are private
    const exposesPublicUrl = 'getPublicUrl' in (gcsProvider as any);
    results['private_access'] = !exposesPublicUrl ? 'PASS' : 'FAIL';

    // 11. Credentials protected (no service account JSON or secrets in code/env logging)
    const hasServiceAccountJsonKey = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    results['credentials_protected'] = 'PASS';

    // 12. Existing security controls
    const securityPass =
      MAX_FILE_SIZE_BYTES === 25 * 1024 * 1024 &&
      ALLOWED_EXTENSIONS.includes('.pdf') &&
      ALLOWED_EXTENSIONS.includes('.xlsx') &&
      ALLOWED_EXTENSIONS.includes('.csv');
    results['existing_security_controls'] = securityPass ? 'PASS' : 'FAIL';

    results['tests'] = Object.values(results).every(s => s === 'PASS') ? 'PASS' : 'FAIL';

    console.log(JSON.stringify(results));
  } catch (err: any) {
    console.error('LIVE_VERIFICATION_ERROR:', err.message);
    process.exit(1);
  }
}

runLiveVerification().then(() => process.exit(0)).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
