import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { Storage, Bucket, File } from '@google-cloud/storage';
import { DocumentFile, DocumentStatus } from './types.js';
import { db } from './storage.js';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.csv',
  '.xlsx',
  '.xls',
  '.doc',
  '.docx',
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const EXTENSION_MIME_MAP: Record<AllowedExtension, string[]> = {
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/pjpeg'],
  '.jpeg': ['image/jpeg', 'image/pjpeg'],
  '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/csv'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls': ['application/vnd.ms-excel'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

export class StorageValidationError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string = 'STORAGE_VALIDATION_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'StorageValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Common storage provider interface for both private filesystem storage and cloud object storage (e.g. GCS).
 */
export interface IDocumentStorageProvider {
  readonly providerName: string;
  saveFile(storageKey: string, buffer: Buffer, mimeType: string): Promise<void>;
  getFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<boolean>;
  fileExists(storageKey: string): Promise<boolean>;
  getReadStream?(storageKey: string): NodeJS.ReadableStream;
}

/**
 * Local Private Storage Provider.
 * Stores files outside the web root in a secure, non-public directory with strict path-traversal prevention.
 */
export class LocalPrivateStorageProvider implements IDocumentStorageProvider {
  public readonly providerName = 'local_private';
  private readonly baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(process.cwd(), 'data', 'private_storage');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  private resolveSafePath(storageKey: string): string {
    // Prevent null bytes or malformed characters
    if (storageKey.includes('\0') || storageKey.includes('..')) {
      throw new StorageValidationError('Invalid storage key: path traversal sequence detected', 'PATH_TRAVERSAL_DETECTED', 400);
    }

    const resolved = path.resolve(this.baseDir, storageKey);
    const normalizedBase = path.resolve(this.baseDir);

    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
      throw new StorageValidationError('Storage path escape detected', 'PATH_TRAVERSAL_DETECTED', 403);
    }

    return resolved;
  }

  public async saveFile(storageKey: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const targetPath = this.resolveSafePath(storageKey);
    const dir = path.dirname(targetPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Atomic write via temp file
    const tmpPath = `${targetPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer, { mode: 0o600 });
    fs.renameSync(tmpPath, targetPath);
  }

  public async getFile(storageKey: string): Promise<Buffer> {
    const targetPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      throw new StorageValidationError('Stored document payload not found on disk', 'FILE_NOT_FOUND', 404);
    }
    return fs.readFileSync(targetPath);
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(storageKey);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
    return false;
  }

  public async fileExists(storageKey: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(storageKey);
    return fs.existsSync(targetPath);
  }

  public getReadStream(storageKey: string): NodeJS.ReadableStream {
    const targetPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(targetPath)) {
      throw new StorageValidationError('Stored document payload not found on disk', 'FILE_NOT_FOUND', 404);
    }
    return fs.createReadStream(targetPath);
  }
}

/**
 * Production Google Cloud Storage Provider.
 * Connects to a private GCS bucket using Application Default Credentials (ADC).
 * Never uses service-account JSON keys in code or files.
 * Streams files for upload and download where practical.
 */
export class GoogleCloudStorageProvider implements IDocumentStorageProvider {
  public readonly providerName = 'google_cloud_storage';
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName?: string, storageInstance?: Storage) {
    // Configured bucket name from environment or fallback default - never hardcode secrets
    const resolvedBucket = (bucketName || process.env.GCS_BUCKET_NAME)?.trim();
    if (!resolvedBucket && process.env.NODE_ENV === 'production') {
      throw new Error('[GoogleCloudStorageProvider] GCS_BUCKET_NAME environment variable is required for production deployment.');
    }
    this.bucketName = resolvedBucket || 'documentchaser-private-docs';
    // Instantiates Storage using Application Default Credentials (ADC)
    // Cloud Run will automatically authenticate via attached service account (documentchaser-cloud-run)
    this.storage = storageInstance || new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'documentchaser-510514',
    });
  }

  public getBucketName(): string {
    return this.bucketName;
  }

  public getBucket(): Bucket {
    return this.storage.bucket(this.bucketName);
  }

  public getFileRef(storageKey: string): File {
    return this.getBucket().file(storageKey);
  }

  public async saveFile(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
    const file = this.getFileRef(storageKey);

    return new Promise((resolve, reject) => {
      // Stream buffer to GCS object with private access and cache-control metadata
      const writeStream = file.createWriteStream({
        resumable: false,
        contentType: mimeType,
        metadata: {
          contentType: mimeType,
          cacheControl: 'private, no-cache, no-store, must-revalidate',
        },
      });

      writeStream.on('error', (err) => {
        reject(new StorageValidationError(`GCS upload failed: ${err.message}`, 'STORAGE_UPLOAD_FAILED', 500));
      });

      writeStream.on('finish', () => {
        resolve();
      });

      const readable = Readable.from(buffer);
      readable.pipe(writeStream);
    });
  }

  public async getFile(storageKey: string): Promise<Buffer> {
    const file = this.getFileRef(storageKey);

    const [exists] = await file.exists();
    if (!exists) {
      throw new StorageValidationError('Stored document payload not found in object storage', 'FILE_NOT_FOUND', 404);
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const readStream = file.createReadStream();

      readStream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      readStream.on('error', (err) => {
        reject(new StorageValidationError(`GCS read error: ${err.message}`, 'STORAGE_READ_ERROR', 500));
      });

      readStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  public getReadStream(storageKey: string): NodeJS.ReadableStream {
    const file = this.getFileRef(storageKey);
    return file.createReadStream();
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    const file = this.getFileRef(storageKey);
    try {
      const [exists] = await file.exists();
      if (!exists) return false;
      await file.delete({ ignoreNotFound: true });
      return true;
    } catch (err: any) {
      if (err?.code === 404) return false;
      throw new StorageValidationError(`GCS delete error: ${err.message}`, 'STORAGE_DELETE_ERROR', 500);
    }
  }

  public async fileExists(storageKey: string): Promise<boolean> {
    const file = this.getFileRef(storageKey);
    try {
      const [exists] = await file.exists();
      return Boolean(exists);
    } catch {
      return false;
    }
  }
}

// Backwards-compatible alias for existing imports
export { GoogleCloudStorageProvider as PrivateObjectStorageProvider };

/**
 * Document Storage Service
 * Handles validation, sanitization, cryptographic key generation, metadata persistence,
 * and retrieval authorization.
 */
export class DocumentStorageService {
  private static provider: IDocumentStorageProvider;

  public static initializeProvider(customProvider?: IDocumentStorageProvider) {
    if (customProvider) {
      this.provider = customProvider;
      return;
    }

    const providerType = (process.env.STORAGE_PROVIDER || 'local_private').toLowerCase().trim();
    if (providerType === 'gcs' || providerType === 'google_cloud_storage') {
      const bucketName = process.env.GCS_BUCKET_NAME?.trim();
      if (!bucketName && process.env.NODE_ENV === 'production') {
        throw new Error('[DocumentStorageService] GCS_BUCKET_NAME environment variable is required in production when STORAGE_PROVIDER=gcs');
      }
      this.provider = new GoogleCloudStorageProvider(bucketName);
    } else if (providerType === 'local_private' || providerType === 'local') {
      this.provider = new LocalPrivateStorageProvider();
    } else {
      throw new Error(`[DocumentStorageService] Unsupported STORAGE_PROVIDER: "${process.env.STORAGE_PROVIDER}". Allowed: "gcs", "local_private"`);
    }
  }

  public static resetProvider(): void {
    this.provider = undefined as any;
  }

  public static getProvider(): IDocumentStorageProvider {
    if (!this.provider) {
      this.initializeProvider();
    }
    return this.provider;
  }

  /**
   * Sanitizes a client-supplied filename to prevent path traversal and shell injection.
   */
  public static sanitizeFilename(inputFilename: string): string {
    if (!inputFilename || typeof inputFilename !== 'string') {
      return 'unnamed_document.pdf';
    }

    // Strip any directory traversal paths (e.g. "../../etc/passwd" -> "passwd")
    let base = path.basename(inputFilename).trim();

    // Remove control characters, null bytes, and dangerous characters
    base = base.replace(/[\0\r\n\t]/g, '');
    base = base.replace(/[<>:"/\\|?*]/g, '_');

    if (!base || base === '.' || base === '..') {
      return `document_${Date.now()}`;
    }

    // Limit length to 150 chars
    if (base.length > 150) {
      const ext = path.extname(base);
      base = base.substring(0, 140) + ext;
    }

    return base;
  }

  /**
   * Validates file size, extension, and binary magic bytes to prevent file-extension spoofing.
   */
  public static validateFile(filename: string, buffer: Buffer, declaredMimeType?: string): {
    sanitizedName: string;
    safeExt: AllowedExtension;
    canonicalMime: string;
    sizeBytes: number;
  } {
    // 1. File Size Validation (Max 25 MB)
    if (!buffer || buffer.length === 0) {
      throw new StorageValidationError('File payload is empty (0 bytes).', 'EMPTY_FILE', 400);
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new StorageValidationError(
        `File exceeds maximum permitted limit of 25MB (Received: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
        'FILE_TOO_LARGE',
        400
      );
    }

    // 2. Filename & Extension Validation
    const sanitizedName = this.sanitizeFilename(filename);
    const ext = path.extname(sanitizedName).toLowerCase() as AllowedExtension;

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new StorageValidationError(
        `Unsupported file type "${ext}". Allowed types: PDF, PNG, JPG, JPEG, CSV, XLSX, XLS, DOC, DOCX.`,
        'INVALID_FILE_TYPE',
        400
      );
    }

    // 3. Inspect binary magic bytes to verify genuine file format
    this.verifyMagicBytes(buffer, ext);

    // Determine canonical MIME type
    const allowedMimes = EXTENSION_MIME_MAP[ext];
    let canonicalMime = allowedMimes[0];
    if (declaredMimeType && allowedMimes.includes(declaredMimeType.toLowerCase())) {
      canonicalMime = declaredMimeType.toLowerCase();
    }

    return {
      sanitizedName,
      safeExt: ext,
      canonicalMime,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Verifies magic bytes signatures to detect extension spoofing (e.g. executable disguised as PNG/PDF).
   */
  private static verifyMagicBytes(buffer: Buffer, ext: AllowedExtension) {
    if (buffer.length < 4) {
      throw new StorageValidationError('File header corrupted or incomplete.', 'CORRUPTED_FILE', 400);
    }

    // Check executable/script blocklists
    // DOS / Windows PE Executable ("MZ")
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new StorageValidationError('Executable binaries are strictly prohibited.', 'EXECUTABLE_REJECTED', 400);
    }
    // Linux ELF binary ("\x7fELF")
    if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      throw new StorageValidationError('Executable binaries are strictly prohibited.', 'EXECUTABLE_REJECTED', 400);
    }

    switch (ext) {
      case '.pdf': {
        // Must start with "%PDF-"
        const header = buffer.subarray(0, 5).toString('ascii');
        if (!header.startsWith('%PDF')) {
          throw new StorageValidationError('File content is not a valid PDF document.', 'INVALID_FILE_SIGNATURE', 400);
        }
        break;
      }
      case '.png': {
        // PNG magic: 89 50 4E 47 0D 0A 1A 0A
        if (
          buffer[0] !== 0x89 ||
          buffer[1] !== 0x50 ||
          buffer[2] !== 0x4e ||
          buffer[3] !== 0x47 ||
          buffer[4] !== 0x0d ||
          buffer[5] !== 0x0a ||
          buffer[6] !== 0x1a ||
          buffer[7] !== 0x0a
        ) {
          throw new StorageValidationError('File content is not a valid PNG image.', 'INVALID_FILE_SIGNATURE', 400);
        }
        break;
      }
      case '.jpg':
      case '.jpeg': {
        // JPEG magic: FF D8 FF
        if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
          throw new StorageValidationError('File content is not a valid JPEG image.', 'INVALID_FILE_SIGNATURE', 400);
        }
        break;
      }
      case '.xlsx':
      case '.docx': {
        // Modern Office files are Zip archives starting with "PK\x03\x04"
        if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
          throw new StorageValidationError('File content is not a valid Office XML document.', 'INVALID_FILE_SIGNATURE', 400);
        }
        break;
      }
      case '.xls':
      case '.doc': {
        // Legacy Microsoft Compound Binary Format (OLE CFB)
        const isOLE =
          buffer[0] === 0xd0 &&
          buffer[1] === 0xcf &&
          buffer[2] === 0x11 &&
          buffer[3] === 0xe0 &&
          buffer[4] === 0xa1 &&
          buffer[5] === 0xb1 &&
          buffer[6] === 0x1a &&
          buffer[7] === 0xe1;
        // Or Zip if mislabelled
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
        if (!isOLE && !isZip) {
          throw new StorageValidationError('File content is not a valid Office binary document.', 'INVALID_FILE_SIGNATURE', 400);
        }
        break;
      }
      case '.csv': {
        // Plain text validation: ensure buffer does not contain null bytes or binary control codes
        const sampleSize = Math.min(buffer.length, 1024);
        for (let i = 0; i < sampleSize; i++) {
          if (buffer[i] === 0x00) {
            throw new StorageValidationError('CSV document contains invalid binary data.', 'INVALID_FILE_SIGNATURE', 400);
          }
        }
        break;
      }
    }
  }

  /**
   * Generates a safe, non-sequential, opaque internal storage key.
   * Format: "firms/<firmId>/requests/<requestId>/sec_<randomHex><safeExt>"
   * Never contains user input or filesystem-sensitive characters.
   */
  public static generateInternalStorageKey(firmId: string, requestId: string, safeExt: string): string {
    const cleanFirm = firmId.replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanReq = requestId.replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeInternalFilename = `sec_${randomHex}${safeExt}`;
    return `firms/${cleanFirm}/requests/${cleanReq}/${safeInternalFilename}`;
  }

  /**
   * Stores a document binary via the active storage provider and records separate metadata.
   */
  public static async storeDocument(options: {
    firmId: string;
    requestId: string;
    requirementId: string;
    filename: string;
    buffer: Buffer;
    declaredMimeType?: string;
  }): Promise<DocumentFile> {
    const { firmId, requestId, requirementId, filename, buffer, declaredMimeType } = options;

    // 1. Strict validation
    const validated = this.validateFile(filename, buffer, declaredMimeType);

    // 2. Generate safe internal storage key
    const storageKey = this.generateInternalStorageKey(firmId, requestId, validated.safeExt);
    const provider = this.getProvider();

    // 3. Write binary to storage provider
    await provider.saveFile(storageKey, buffer, validated.canonicalMime);

    // 4. Create metadata record separate from binary
    const docId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newDoc: DocumentFile = {
      id: docId,
      firmId,
      requestId,
      requirementId,
      filename: validated.sanitizedName,
      originalName: validated.sanitizedName,
      mimeType: validated.canonicalMime,
      sizeBytes: validated.sizeBytes,
      status: 'Uploaded',
      storageProvider: provider.providerName,
      storageKey,
      uploadedAt: new Date().toISOString(),
    };

    const data = db.getData();
    data.documents.unshift(newDoc);
    db.commit();

    return newDoc;
  }

  /**
   * Retrieves document binary securely. Handles fallback for legacy seed data if necessary.
   */
  public static async retrieveDocumentBinary(doc: DocumentFile): Promise<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
    sizeBytes: number;
    stream?: NodeJS.ReadableStream;
  }> {
    const provider = this.getProvider();

    if (doc.storageKey) {
      let stream: NodeJS.ReadableStream | undefined;
      if (typeof provider.getReadStream === 'function') {
        try {
          stream = provider.getReadStream(doc.storageKey);
        } catch {
          stream = undefined;
        }
      }
      const buffer = await provider.getFile(doc.storageKey);
      return {
        buffer,
        stream,
        mimeType: doc.mimeType || 'application/octet-stream',
        filename: doc.filename,
        sizeBytes: buffer.length,
      };
    }

    // Fallback for legacy seed records stored with base64 dataUri
    if (doc.fileDataUri && doc.fileDataUri.startsWith('data:')) {
      const parts = doc.fileDataUri.split(',');
      const matches = parts[0].match(/:(.*?);/);
      const mime = matches ? matches[1] : doc.mimeType;
      const buffer = Buffer.from(parts[1], 'base64');
      return {
        buffer,
        mimeType: mime,
        filename: doc.filename,
        sizeBytes: buffer.length,
      };
    }

    throw new StorageValidationError('Document binary could not be resolved from storage', 'STORAGE_PAYLOAD_MISSING', 404);
  }

  /**
   * Deletes a document from the storage provider and metadata registry.
   */
  public static async deleteDocument(doc: DocumentFile): Promise<boolean> {
    const provider = this.getProvider();

    if (doc.storageKey) {
      try {
        await provider.deleteFile(doc.storageKey);
      } catch (err) {
        console.warn(`Could not delete storage key "${doc.storageKey}" from provider:`, err);
      }
    }

    const data = db.getData();
    const index = data.documents.findIndex(d => d.id === doc.id && d.firmId === doc.firmId);
    if (index !== -1) {
      data.documents.splice(index, 1);
    }

    db.commit();
    return true;
  }
}
