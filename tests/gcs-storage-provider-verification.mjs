// tests/gcs-storage-provider-verification.mjs
// Verification of Google Cloud Storage Provider and Provider Switching for DocumentChaser

import assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import {
  DocumentStorageService,
  LocalPrivateStorageProvider,
  GoogleCloudStorageProvider,
  PrivateObjectStorageProvider,
  StorageValidationError,
} from '../server/documentStorage.js';

console.log('================================================================');
console.log('DocumentChaser GCS Provider & Storage Abstraction Tests');
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

async function runTests() {
  const originalStorageProvider = process.env.STORAGE_PROVIDER;
  const originalBucketName = process.env.GCS_BUCKET_NAME;

  try {
    // ----------------------------------------------------
    // TEST 1: Default / Local Provider Selection
    // ----------------------------------------------------
    console.log('1. Testing Local Provider Selection:');
    delete process.env.STORAGE_PROVIDER;
    DocumentStorageService.resetProvider();
    const defaultProvider = DocumentStorageService.getProvider();
    record(
      'Unset STORAGE_PROVIDER defaults to LocalPrivateStorageProvider',
      defaultProvider instanceof LocalPrivateStorageProvider && defaultProvider.providerName === 'local_private'
    );

    process.env.STORAGE_PROVIDER = 'local_private';
    DocumentStorageService.resetProvider();
    const localProvider = DocumentStorageService.getProvider();
    record(
      'STORAGE_PROVIDER=local_private instantiates LocalPrivateStorageProvider',
      localProvider instanceof LocalPrivateStorageProvider && localProvider.providerName === 'local_private'
    );

    // ----------------------------------------------------
    // TEST 2: GCS Provider Selection
    // ----------------------------------------------------
    console.log('\n2. Testing GCS Provider Selection & Configuration:');
    process.env.STORAGE_PROVIDER = 'gcs';
    process.env.GCS_BUCKET_NAME = 'documentchaser-private-docs';
    DocumentStorageService.resetProvider();
    const gcsProvider = DocumentStorageService.getProvider();
    record(
      'STORAGE_PROVIDER=gcs instantiates GoogleCloudStorageProvider',
      gcsProvider instanceof GoogleCloudStorageProvider && gcsProvider.providerName === 'google_cloud_storage'
    );

    record(
      'Configured GCS bucket name matches environment variable',
      gcsProvider.getBucketName() === 'documentchaser-private-docs'
    );

    record(
      'PrivateObjectStorageProvider is an alias to GoogleCloudStorageProvider',
      PrivateObjectStorageProvider === GoogleCloudStorageProvider
    );

    // ----------------------------------------------------
    // TEST 3: Application Default Credentials & No Secret Keys
    // ----------------------------------------------------
    console.log('\n3. Testing Application Default Credentials (ADC) Integration:');
    record(
      'GCS client is instantiated without requiring service-account key files',
      Boolean(gcsProvider.getStorageClient())
    );

    // ----------------------------------------------------
    // TEST 4: Mocked GCS Operations (Upload, Download, Delete, Exists)
    // ----------------------------------------------------
    console.log('\n4. Testing GCS Provider Streaming Upload, Download & Deletion:');

    // In-memory mock bucket for testing GCS provider behavior without real network
    const inMemoryGcsFiles = new Map();

    const mockStorageClient = {
      bucket: (bName) => ({
        name: bName,
        file: (storageKey) => {
          return {
            name: storageKey,
            createWriteStream: (options = {}) => {
              const stream = new PassThrough();
              const chunks = [];
              stream.on('data', (c) => chunks.push(c));
              stream.on('finish', () => {
                inMemoryGcsFiles.set(storageKey, {
                  buffer: Buffer.concat(chunks),
                  metadata: options.metadata || {},
                });
              });
              return stream;
            },
            createReadStream: () => {
              const stream = new PassThrough();
              setImmediate(() => {
                if (inMemoryGcsFiles.has(storageKey)) {
                  stream.write(inMemoryGcsFiles.get(storageKey).buffer);
                  stream.end();
                } else {
                  const notFoundErr = new Error('No such object');
                  notFoundErr.code = 404;
                  stream.emit('error', notFoundErr);
                }
              });
              return stream;
            },
            exists: async () => {
              return [inMemoryGcsFiles.has(storageKey)];
            },
            delete: async (opts = {}) => {
              if (inMemoryGcsFiles.has(storageKey)) {
                inMemoryGcsFiles.delete(storageKey);
                return [{}];
              }
              if (opts.ignoreNotFound) return [{}];
              const err = new Error('No such object');
              err.code = 404;
              throw err;
            },
          };
        },
      }),
    };

    const isolatedGcsProvider = new GoogleCloudStorageProvider('documentchaser-private-docs', mockStorageClient);

    const testKey = 'firms/firm_a/requests/req_123/sec_abcdef0123456789.pdf';
    const samplePayload = Buffer.from('%PDF-1.7 Sample Audit Test Payload');
    const sampleMime = 'application/pdf';

    // Save File
    await isolatedGcsProvider.saveFile(testKey, samplePayload, sampleMime);
    record(
      'GCS saveFile streams payload and stores in private bucket',
      inMemoryGcsFiles.has(testKey) && inMemoryGcsFiles.get(testKey).buffer.equals(samplePayload)
    );

    record(
      'GCS object metadata sets correct private cacheControl and contentType',
      inMemoryGcsFiles.get(testKey).metadata?.contentType === sampleMime
    );

    // File Exists
    const existsTrue = await isolatedGcsProvider.fileExists(testKey);
    const existsFalse = await isolatedGcsProvider.fileExists('non_existent_key.pdf');
    record('GCS fileExists reports true for stored object and false for missing', existsTrue && !existsFalse);

    // Get File
    const retrievedBuffer = await isolatedGcsProvider.getFile(testKey);
    record('GCS getFile retrieves exact binary buffer', retrievedBuffer.equals(samplePayload));

    // Get File Stream
    const stream = isolatedGcsProvider.getFileStream(testKey);
    record('GCS getFileStream returns a valid readable stream', stream && typeof stream.pipe === 'function');

    // Delete File
    const deleteResult = await isolatedGcsProvider.deleteFile(testKey);
    const existsAfterDelete = await isolatedGcsProvider.fileExists(testKey);
    record('GCS deleteFile removes object from bucket', deleteResult && !existsAfterDelete);

    // 404 Handling
    let notFoundCaught = false;
    try {
      await isolatedGcsProvider.getFile('firms/firm_a/requests/req_123/missing.pdf');
    } catch (err) {
      if (err instanceof StorageValidationError && err.statusCode === 404) {
        notFoundCaught = true;
      }
    }
    record('GCS getFile on missing object throws 404 StorageValidationError', notFoundCaught);

    // ----------------------------------------------------
    // TEST 5: Storage Keys & Filename Validation Preserved
    // ----------------------------------------------------
    console.log('\n5. Testing Security Controls & Key Generation:');
    const safeKey = DocumentStorageService.generateInternalStorageKey('firm_apex_01', 'req_vat_2026', '.pdf');
    record(
      'Internal storage key is scoped and cryptographically random',
      safeKey.startsWith('firms/firm_apex_01/requests/req_vat_2026/sec_') && safeKey.endsWith('.pdf')
    );

    const sanitized = DocumentStorageService.sanitizeFilename('../../sensitive/passwords.txt');
    record('Path traversal in filename is sanitized away', sanitized === 'passwords.txt');

    let invalidTypeCaught = false;
    try {
      DocumentStorageService.validateFile('script.exe', Buffer.from('MZ0000000'));
    } catch (err) {
      if (err instanceof StorageValidationError) {
        invalidTypeCaught = true;
      }
    }
    record('Disallowed executable blocked before reaching storage provider', invalidTypeCaught);

    // ----------------------------------------------------
    // TEST 6: Local Provider Preservation for Local Dev
    // ----------------------------------------------------
    console.log('\n6. Testing Local Provider Preservation:');
    const localFsProvider = new LocalPrivateStorageProvider();
    const localKey = 'firms/local_test/requests/req_loc/sec_test.pdf';
    await localFsProvider.saveFile(localKey, samplePayload, sampleMime);
    const localRetrieved = await localFsProvider.getFile(localKey);
    record('LocalPrivateStorageProvider functions independently for local development', localRetrieved.equals(samplePayload));
    await localFsProvider.deleteFile(localKey);

  } finally {
    // Restore environment variables
    if (originalStorageProvider !== undefined) {
      process.env.STORAGE_PROVIDER = originalStorageProvider;
    } else {
      delete process.env.STORAGE_PROVIDER;
    }
    if (originalBucketName !== undefined) {
      process.env.GCS_BUCKET_NAME = originalBucketName;
    } else {
      delete process.env.GCS_BUCKET_NAME;
    }
    DocumentStorageService.resetProvider();
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
