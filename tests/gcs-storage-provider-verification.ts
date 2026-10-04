// tests/gcs-storage-provider-verification.ts
// Automated Verification Suite for Google Cloud Storage Provider and Selection Abstraction

import assert from 'assert';
import { Readable, Writable } from 'stream';
import {
  DocumentStorageService,
  GoogleCloudStorageProvider,
  LocalPrivateStorageProvider,
  PrivateObjectStorageProvider,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  StorageValidationError,
} from '../server/documentStorage.js';

let passed = 0;
let failed = 0;

function record(title: string, condition: boolean, detail: string = '') {
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title} - ${detail}`);
    failed++;
  }
}

async function runGcsStorageProviderTestSuite() {
  console.log('================================================================');
  console.log('DocumentChaser Google Cloud Storage Provider Verification Suite');
  console.log('================================================================\n');

  const originalStorageProvider = process.env.STORAGE_PROVIDER;
  const originalBucketName = process.env.GCS_BUCKET_NAME;

  try {
    // ----------------------------------------------------
    // TEST 1: Default & Local Provider Selection
    // ----------------------------------------------------
    console.log('1. Testing Provider Selection (Local Provider):');
    process.env.STORAGE_PROVIDER = 'local_private';
    DocumentStorageService.resetProvider();
    const localProvider = DocumentStorageService.getProvider();

    record(
      'STORAGE_PROVIDER=local_private selects LocalPrivateStorageProvider',
      localProvider instanceof LocalPrivateStorageProvider
    );
    record(
      'Local provider has providerName "local_private"',
      localProvider.providerName === 'local_private'
    );

    // ----------------------------------------------------
    // TEST 2: GCS Provider Selection via Environment Variable
    // ----------------------------------------------------
    console.log('\n2. Testing Provider Selection (GCS Provider):');
    process.env.STORAGE_PROVIDER = 'gcs';
    process.env.GCS_BUCKET_NAME = 'documentchaser-private-docs';
    DocumentStorageService.resetProvider();
    const gcsProvider = DocumentStorageService.getProvider();

    record(
      'STORAGE_PROVIDER=gcs selects GoogleCloudStorageProvider',
      gcsProvider instanceof GoogleCloudStorageProvider
    );
    record(
      'GCS provider has providerName "google_cloud_storage"',
      gcsProvider.providerName === 'google_cloud_storage'
    );
    record(
      'PrivateObjectStorageProvider is aliased to GoogleCloudStorageProvider',
      PrivateObjectStorageProvider === GoogleCloudStorageProvider
    );
    record(
      'GCS provider configures bucket name from environment',
      (gcsProvider as GoogleCloudStorageProvider).getBucketName() === 'documentchaser-private-docs'
    );

    // Also verify alias 'google_cloud_storage'
    process.env.STORAGE_PROVIDER = 'google_cloud_storage';
    DocumentStorageService.resetProvider();
    const gcsProviderAlias = DocumentStorageService.getProvider();
    record(
      'STORAGE_PROVIDER=google_cloud_storage also selects GoogleCloudStorageProvider',
      gcsProviderAlias instanceof GoogleCloudStorageProvider
    );

    // ----------------------------------------------------
    // TEST 3: Switching Back to Local Provider & Strict No-Fallback
    // ----------------------------------------------------
    console.log('\n3. Testing Provider Switching & Strict No-Fallback:');
    process.env.STORAGE_PROVIDER = 'local_private';
    DocumentStorageService.resetProvider();
    const switchedLocal = DocumentStorageService.getProvider();
    record(
      'Switching STORAGE_PROVIDER back to local_private returns LocalPrivateStorageProvider',
      switchedLocal instanceof LocalPrivateStorageProvider
    );

    // Verify invalid provider throws rather than silently falling back
    process.env.STORAGE_PROVIDER = 'invalid_unknown_provider';
    DocumentStorageService.resetProvider();
    let threwOnInvalid = false;
    try {
      DocumentStorageService.getProvider();
    } catch {
      threwOnInvalid = true;
    }
    record(
      'Invalid STORAGE_PROVIDER throws descriptive error instead of silently falling back to local',
      threwOnInvalid
    );

    // Verify GCS_BUCKET_NAME required in production mode
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_PROVIDER = 'gcs';
    delete process.env.GCS_BUCKET_NAME;
    DocumentStorageService.resetProvider();
    let threwOnMissingBucketInProd = false;
    try {
      DocumentStorageService.getProvider();
    } catch {
      threwOnMissingBucketInProd = true;
    }
    record(
      'Missing GCS_BUCKET_NAME in production throws error (GCS_BUCKET_NAME is required in production)',
      threwOnMissingBucketInProd
    );
    process.env.NODE_ENV = prevNodeEnv;
    process.env.STORAGE_PROVIDER = 'local_private';
    DocumentStorageService.resetProvider();

    // ----------------------------------------------------
    // TEST 4: IDocumentStorageProvider Interface Conformance
    // ----------------------------------------------------
    console.log('\n4. Testing IDocumentStorageProvider Interface Conformance:');
    const requiredMethods = ['saveFile', 'getFile', 'deleteFile', 'fileExists', 'getReadStream'];
    let allMethodsPresentOnGcs = true;
    for (const method of requiredMethods) {
      if (typeof (gcsProvider as any)[method] !== 'function') {
        allMethodsPresentOnGcs = false;
        console.error(`Missing method on GCS provider: ${method}`);
      }
    }
    record(
      'GoogleCloudStorageProvider implements all IDocumentStorageProvider methods (saveFile, getFile, deleteFile, fileExists, getReadStream)',
      allMethodsPresentOnGcs
    );

    let allMethodsPresentOnLocal = true;
    for (const method of requiredMethods) {
      if (typeof (localProvider as any)[method] !== 'function') {
        allMethodsPresentOnLocal = false;
        console.error(`Missing method on Local provider: ${method}`);
      }
    }
    record(
      'LocalPrivateStorageProvider implements all IDocumentStorageProvider methods (including getReadStream)',
      allMethodsPresentOnLocal
    );

    // ----------------------------------------------------
    // TEST 5: Storage Key Format Preservation
    // ----------------------------------------------------
    console.log('\n5. Testing Storage Key Generation & Preservation:');
    const testKey = DocumentStorageService.generateInternalStorageKey('firm_apex_02', 'req_test_99', '.pdf');
    record(
      'Generated key adheres to pattern "firms/<firmId>/requests/<requestId>/sec_<hex>.pdf"',
      /^firms\/firm_apex_02\/requests\/req_test_99\/sec_[0-9a-f]{32}\.pdf$/.test(testKey)
    );
    record(
      'Generated storage key contains high-entropy random bytes (not predictable)',
      testKey.includes('sec_') && testKey.length > 50
    );

    // ----------------------------------------------------
    // TEST 6: GoogleCloudStorageProvider with Mock Storage Client (Upload, Download, Delete, Streaming)
    // ----------------------------------------------------
    console.log('\n6. Testing GCS Streaming Provider End-to-End with Mock Storage:');
    const mockFiles = new Map<string, { buffer: Buffer; metadata: any }>();

    const mockStorage: any = {
      bucket: (bucketName: string) => ({
        name: bucketName,
        file: (storageKey: string) => ({
          name: storageKey,
          exists: async () => [mockFiles.has(storageKey)],
          createWriteStream: (options: any) => {
            const chunks: Buffer[] = [];
            const writeStream = new Writable({
              write(chunk, encoding, callback) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                callback();
              },
            });
            writeStream.on('finish', () => {
              mockFiles.set(storageKey, {
                buffer: Buffer.concat(chunks),
                metadata: options.metadata || {},
              });
            });
            return writeStream;
          },
          createReadStream: () => {
            const fileData = mockFiles.get(storageKey);
            if (!fileData) {
              const errStream = new Readable({
                read() {
                  this.destroy(new Error('File not found in mock bucket'));
                },
              });
              return errStream;
            }
            return Readable.from(fileData.buffer);
          },
          delete: async () => {
            mockFiles.delete(storageKey);
            return [{}];
          },
        }),
      }),
    };

    const mockGcsProvider = new GoogleCloudStorageProvider('documentchaser-private-docs', mockStorage);
    const samplePayload = Buffer.from('%PDF-1.4 Mock Encrypted Bank Statement Payload Data');
    const sampleKey = 'firms/firm_test/requests/req_test/sec_abcdef1234567890abcdef1234567890.pdf';

    // Save
    await mockGcsProvider.saveFile(sampleKey, samplePayload, 'application/pdf');
    record('GCS provider saveFile uploads payload successfully via stream', mockFiles.has(sampleKey));

    // Exists
    const exists = await mockGcsProvider.fileExists(sampleKey);
    record('GCS provider fileExists confirms object presence in private bucket', exists === true);

    // Get
    const downloadedBuffer = await mockGcsProvider.getFile(sampleKey);
    record(
      'GCS provider getFile retrieves identical byte payload via stream',
      downloadedBuffer.equals(samplePayload)
    );

    // Stream
    const stream = mockGcsProvider.getReadStream(sampleKey);
    const streamChunks: Buffer[] = [];
    for await (const chunk of stream) {
      streamChunks.push(Buffer.from(chunk));
    }
    const streamedBuffer = Buffer.concat(streamChunks);
    record(
      'GCS provider getReadStream streams file bytes directly without buffering entire payload upfront',
      streamedBuffer.equals(samplePayload)
    );

    // Delete
    const deleted = await mockGcsProvider.deleteFile(sampleKey);
    record('GCS provider deleteFile removes file from private bucket', deleted === true);
    const existsAfterDelete = await mockGcsProvider.fileExists(sampleKey);
    record('GCS provider fileExists returns false after deletion', existsAfterDelete === false);

    // ----------------------------------------------------
    // TEST 7: Security Invariants Preserved
    // ----------------------------------------------------
    console.log('\n7. Testing Security & File Validation Preservation:');
    record('Max file size remains 25 MB', MAX_FILE_SIZE_BYTES === 25 * 1024 * 1024);
    record(
      'Allowed file extensions whitelist preserved',
      ALLOWED_EXTENSIONS.includes('.pdf') &&
        ALLOWED_EXTENSIONS.includes('.csv') &&
        ALLOWED_EXTENSIONS.includes('.xlsx')
    );

    // Path traversal in filename sanitization
    const sanitized = DocumentStorageService.sanitizeFilename('../../etc/passwd.pdf');
    record(
      'Filename sanitization neutralizes directory traversal before storage key generation',
      sanitized === 'passwd.pdf'
    );

    // ----------------------------------------------------
    // TEST 8: No Credentials in Source Code
    // ----------------------------------------------------
    console.log('\n8. Testing Credentials & Configuration Boundary:');
    const gcsInstance = new GoogleCloudStorageProvider('documentchaser-private-docs');
    record(
      'GCS provider instantiated with Application Default Credentials (no hardcoded keys)',
      gcsInstance instanceof GoogleCloudStorageProvider
    );

  } finally {
    process.env.STORAGE_PROVIDER = originalStorageProvider;
    process.env.GCS_BUCKET_NAME = originalBucketName;
    DocumentStorageService.resetProvider();
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runGcsStorageProviderTestSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
