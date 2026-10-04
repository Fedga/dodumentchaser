import { db } from './storage.js';
import { notificationService } from './notifications.js';
import {
  DocumentRequest,
  DocumentRequirement,
  Reminder,
  ActivityLog,
  Client,
  Firm,
} from './types.js';

export interface RequestEvaluation {
  requestId: string;
  firmId: string;
  clientId: string;
  requestStatus: string;
  isComplete: boolean;
  totalRequiredCount: number;
  completedApprovedCount: number;
  missingRequiredDocs: DocumentRequirement[];
  shouldSendReminder: boolean;
  nextReminderDue?: string;
  nextReminderNumber?: number;
  reason: string;
}

export interface SendReminderResult {
  success: boolean;
  sent: boolean;
  reminder?: Reminder;
  reason: string;
  missingDocuments: string[];
  messageId?: string;
  deliveryStatus?: 'sent' | 'delivered' | 'failed' | 'simulated';
  error?: string;
}

export class ChasingEngine {
  // In-memory request execution locks to prevent concurrent race conditions
  private static executionLocks = new Set<string>();

  /**
   * Evaluates the current state of a document request.
   * Core logic:
   * required documents minus completed/approved documents = currently missing documents.
   * Only missing required documents should be included in reminders.
   */
  public static evaluateRequest(requestId: string): RequestEvaluation | null {
    const data = db.getData();
    const request = data.requests.find(r => r.id === requestId);
    if (!request) return null;

    const requirements = data.requirements.filter(rq => rq.requestId === request.id);

    // Filter required documents
    const requiredDocs = requirements.filter(rq => rq.required);
    // Completed / approved documents: Approved or Not applicable
    const completedApprovedDocs = requiredDocs.filter(
      rq => rq.status === 'Approved' || rq.status === 'Not applicable'
    );
    // Currently missing required documents
    const currentlyMissingDocs = requiredDocs.filter(
      rq => rq.status !== 'Approved' && rq.status !== 'Not applicable'
    );

    const totalRequiredCount = requiredDocs.length;
    const completedApprovedCount = completedApprovedDocs.length;

    // Check if ALL required documents are received and approved
    if (totalRequiredCount > 0 && currentlyMissingDocs.length === 0) {
      let stateChanged = false;
      if (request.status !== 'Completed') {
        request.status = 'Completed';
        request.completedAt = request.completedAt || new Date().toISOString();
        request.remindersPaused = true; // Automatically stop reminders
        request.updatedAt = new Date().toISOString();
        stateChanged = true;

        // Record completion activity log
        const client = data.clients.find(c => c.id === request.clientId);
        const hasCompletionLog = data.activityLogs.some(
          a => a.requestId === request.id && a.action === 'request_completed'
        );
        if (!hasCompletionLog) {
          data.activityLogs.unshift({
            id: `act_${Date.now()}_complete`,
            firmId: request.firmId,
            requestId: request.id,
            clientId: request.clientId,
            action: 'request_completed',
            description: `All required documents approved. Request "${request.name}" marked complete for ${client ? client.companyName : 'Client'}.`,
            actorType: 'system',
            actorName: 'DocumentChaser Automated Chaser',
            createdAt: new Date().toISOString(),
          });
        }
      }

      if (stateChanged) {
        db.commit();
      }

      return {
        requestId: request.id,
        firmId: request.firmId,
        clientId: request.clientId,
        requestStatus: 'Completed',
        isComplete: true,
        totalRequiredCount,
        completedApprovedCount,
        missingRequiredDocs: [],
        shouldSendReminder: false,
        reason: 'ALL_REQUIRED_DOCUMENTS_APPROVED',
      };
    }

    // If request was completed but requirements were reopened/rejected:
    if (request.status === 'Completed' && currentlyMissingDocs.length > 0) {
      request.status = 'Active';
      request.completedAt = undefined;
      request.updatedAt = new Date().toISOString();
      db.commit();
    }

    // Overdue Workflow State Check
    const isPastDue = new Date(request.dueDate) < new Date();
    if (isPastDue && request.status !== 'Completed' && request.status !== 'Overdue') {
      request.status = 'Overdue';
      request.updatedAt = new Date().toISOString();
      db.commit();
    }

    // Check if reminders are paused
    if (request.remindersPaused) {
      return {
        requestId: request.id,
        firmId: request.firmId,
        clientId: request.clientId,
        requestStatus: request.status,
        isComplete: false,
        totalRequiredCount,
        completedApprovedCount,
        missingRequiredDocs: currentlyMissingDocs,
        shouldSendReminder: false,
        reason: 'REMINDERS_PAUSED',
      };
    }

    // Check maximum reminders limit (1, 2, 3, 5, or unlimited <= 0 or >= 999)
    const maxReminders = request.maxReminders;
    const currentReminderCount = request.reminderCount || 0;
    if (maxReminders > 0 && maxReminders < 999 && currentReminderCount >= maxReminders) {
      return {
        requestId: request.id,
        firmId: request.firmId,
        clientId: request.clientId,
        requestStatus: request.status,
        isComplete: false,
        totalRequiredCount,
        completedApprovedCount,
        missingRequiredDocs: currentlyMissingDocs,
        shouldSendReminder: false,
        reason: 'MAX_REMINDERS_REACHED',
      };
    }

    // Check reminder interval timing (1 day, 3 days, 5 days, 7 days, custom)
    const intervalDays = request.reminderFrequencyDays || 3;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

    const baseTime = request.lastReminderSentAt
      ? new Date(request.lastReminderSentAt).getTime()
      : request.clientNotifiedAt
      ? new Date(request.clientNotifiedAt).getTime()
      : new Date(request.createdAt).getTime();

    const nextDueDate = new Date(baseTime + intervalMs);
    const isDue = Date.now() >= nextDueDate.getTime();

    if (!isDue) {
      return {
        requestId: request.id,
        firmId: request.firmId,
        clientId: request.clientId,
        requestStatus: request.status,
        isComplete: false,
        totalRequiredCount,
        completedApprovedCount,
        missingRequiredDocs: currentlyMissingDocs,
        shouldSendReminder: false,
        nextReminderDue: nextDueDate.toISOString(),
        reason: 'REMINDER_NOT_YET_DUE',
      };
    }

    return {
      requestId: request.id,
      firmId: request.firmId,
      clientId: request.clientId,
      requestStatus: request.status,
      isComplete: false,
      totalRequiredCount,
      completedApprovedCount,
      missingRequiredDocs: currentlyMissingDocs,
      shouldSendReminder: true,
      nextReminderDue: nextDueDate.toISOString(),
      nextReminderNumber: currentReminderCount + 1,
      reason: 'REMINDER_DUE',
    };
  }

  /**
   * Sends an automated or manual reminder with strict idempotency and audit logging.
   */
  public static async sendReminder(
    requestId: string,
    options: {
      force?: boolean;
      triggerType?: 'automated' | 'manual';
      actorName?: string;
      idempotencyKey?: string;
    } = {}
  ): Promise<SendReminderResult> {
    const data = db.getData();
    const request = data.requests.find(r => r.id === requestId);
    if (!request) {
      return {
        success: false,
        sent: false,
        reason: 'REQUEST_NOT_FOUND',
        missingDocuments: [],
        error: 'Document request not found',
      };
    }

    // ACQUIRE LOCK (Concurrency safety)
    if (this.executionLocks.has(requestId)) {
      return {
        success: false,
        sent: false,
        reason: 'CONCURRENT_EXECUTION_LOCKED',
        missingDocuments: [],
        error: 'A reminder is already currently processing for this request',
      };
    }
    this.executionLocks.add(requestId);

    try {
      const evaluation = this.evaluateRequest(requestId);
      if (!evaluation) {
        return {
          success: false,
          sent: false,
          reason: 'EVALUATION_FAILED',
          missingDocuments: [],
        };
      }

      // If request is already complete or no missing required documents
      if (evaluation.isComplete) {
        return {
          success: true,
          sent: false,
          reason: 'ALL_REQUIRED_DOCUMENTS_APPROVED',
          missingDocuments: [],
        };
      }

      // MAX REMINDERS REACHED: Cannot be exceeded even if manual
      if (evaluation.reason === 'MAX_REMINDERS_REACHED') {
        return {
          success: true,
          sent: false,
          reason: 'MAX_REMINDERS_REACHED',
          missingDocuments: evaluation.missingRequiredDocs.map(d => d.name),
        };
      }

      // If reminders are paused and not forced
      if (evaluation.reason === 'REMINDERS_PAUSED' && !options.force) {
        return {
          success: true,
          sent: false,
          reason: 'REMINDERS_PAUSED',
          missingDocuments: evaluation.missingRequiredDocs.map(d => d.name),
        };
      }

      // If not due and not forced
      if (!options.force && !evaluation.shouldSendReminder) {
        return {
          success: true,
          sent: false,
          reason: evaluation.reason,
          missingDocuments: evaluation.missingRequiredDocs.map(d => d.name),
        };
      }

      const client = data.clients.find(c => c.id === request.clientId);
      if (!client) {
        return {
          success: false,
          sent: false,
          reason: 'CLIENT_NOT_FOUND',
          missingDocuments: [],
          error: 'Client profile not found',
        };
      }

      const firm = data.firms.find(f => f.id === request.firmId);
      const nextReminderNumber = (request.reminderCount || 0) + 1;
      const idempotencyKey = options.idempotencyKey || `chase:${request.id}:${nextReminderNumber}`;

      // IDEMPOTENCY CHECK
      // Prevent duplicate job execution for the exact same reminder number or key
      const existingReminderForNumber = data.reminders.find(
        rem => rem.requestId === request.id && (rem.reminderNumber === nextReminderNumber || (rem.idempotencyKey && rem.idempotencyKey === idempotencyKey))
      );
      if (existingReminderForNumber) {
        return {
          success: true,
          sent: false,
          reason: 'DUPLICATE_JOB_EXECUTION_PREVENTED',
          missingDocuments: evaluation.missingRequiredDocs.map(d => d.name),
          reminder: existingReminderForNumber,
        };
      }

      // Check cooldown if last reminder was dispatched within 1 second on automated triggers (prevents accidental double-runs)
      if (!options.force && request.lastReminderSentAt) {
        const timeSinceLast = Date.now() - new Date(request.lastReminderSentAt).getTime();
        if (timeSinceLast < 1000) {
          return {
            success: true,
            sent: false,
            reason: 'COOLDOWN_ACTIVE',
            missingDocuments: evaluation.missingRequiredDocs.map(d => d.name),
          };
        }
      }

      // Core Logic: Only missing required documents are included in reminders
      const missingDocsList = evaluation.missingRequiredDocs;
      const missingDocNames = missingDocsList.map(d => d.name);

      const portalUrl = `${process.env.APP_URL || ''}/portal/${request.portalToken}`;

      const subject = `Action Required: ${missingDocNames.length} outstanding document${
        missingDocNames.length > 1 ? 's' : ''
      } for ${request.name}`;

      const formattedMissingList = missingDocsList
        .map((d, idx) => {
          let extra = '';
          if (d.status === 'Rejected') {
            extra = ` — Changes requested: "${d.rejectionReason || 'Please re-upload a clear copy'}"`;
          }
          return `  ${idx + 1}. ${d.name}${extra}`;
        })
        .join('\n');

      const body = `Dear ${client.name},\n\n` +
        `This is a reminder from ${firm ? firm.name : 'your accounting team'} regarding documentation requested for:\n` +
        `"${request.name}" (Due date: ${request.dueDate})\n\n` +
        `Currently missing required documents:\n` +
        `${formattedMissingList}\n\n` +
        `Please upload your documents securely via your private client portal:\n` +
        `${portalUrl}\n\n` +
        `No password or registration required. Thank you,\n` +
        `${firm ? firm.name : 'Your Practice Team'}`;

      // DISPATCH VIA NOTIFICATION SERVICE ABSTRACTION (With automatic retries)
      const dispatchResult = await notificationService.sendEmailWithRetry({
        to: client.email,
        recipientName: client.name,
        subject,
        body,
        idempotencyKey,
        metadata: {
          requestId: request.id,
          clientId: client.id,
          firmId: request.firmId,
          reminderNumber: nextReminderNumber,
          missingCount: missingDocNames.length,
        },
      });

      const now = new Date().toISOString();
      const reminderId = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      // RECORD REMINDER WITH ALL REQUIRED ATTRIBUTES:
      // request ID, client ID, firm ID, reminder number, timestamp, missing documents at time of sending, delivery status
      const reminderRecord: Reminder = {
        id: reminderId,
        firmId: request.firmId,
        requestId: request.id,
        clientId: request.clientId,
        reminderNumber: nextReminderNumber,
        recipientEmail: client.email,
        recipientName: client.name,
        subject,
        body,
        missingDocuments: missingDocNames,
        sentAt: now,
        triggerType: options.triggerType || 'automated',
        deliveryStatus: dispatchResult.deliveryStatus,
        status: dispatchResult.success ? 'sent' : 'failed',
        idempotencyKey,
      };

      data.reminders.unshift(reminderRecord);

      // Update request reminder tracking
      request.lastReminderSentAt = now;
      request.reminderCount = nextReminderNumber;
      request.updatedAt = now;

      // AUDIT LOG
      const triggerLabel = options.triggerType === 'manual' ? 'Manual' : 'Automated';
      const actor = options.actorName || (options.triggerType === 'manual' ? 'Accountant' : 'DocumentChaser Automated Chaser');
      data.activityLogs.unshift({
        id: `act_${Date.now()}_rem`,
        firmId: request.firmId,
        requestId: request.id,
        clientId: request.clientId,
        action: 'reminder_sent',
        description: `${triggerLabel} reminder #${nextReminderNumber} dispatched to ${client.companyName} (${missingDocNames.length} missing documents: ${missingDocNames.slice(0, 3).join(', ')}${missingDocNames.length > 3 ? '...' : ''})`,
        actorType: options.triggerType === 'manual' ? 'accountant' : 'system',
        actorName: actor,
        createdAt: now,
      });

      db.commit();

      return {
        success: dispatchResult.success,
        sent: true,
        reminder: reminderRecord,
        reason: 'REMINDER_SENT',
        missingDocuments: missingDocNames,
        messageId: dispatchResult.messageId,
        deliveryStatus: dispatchResult.deliveryStatus,
        error: dispatchResult.error,
      };
    } finally {
      this.executionLocks.delete(requestId);
    }
  }

  /**
   * Hook called whenever a requirement's document state changes (upload, approve, reject).
   * Automatically completes the request if all required documents are approved.
   */
  public static handleDocumentStateChanged(requestId: string): { isComplete: boolean; request?: DocumentRequest } {
    const data = db.getData();
    const request = data.requests.find(r => r.id === requestId);
    if (!request) return { isComplete: false };

    const evaluation = this.evaluateRequest(requestId);
    return {
      isComplete: evaluation ? evaluation.isComplete : false,
      request,
    };
  }

  /**
   * Pauses automated reminders for a request.
   */
  public static pauseReminders(requestId: string, actorName = 'Accountant'): boolean {
    const data = db.getData();
    const request = data.requests.find(r => r.id === requestId);
    if (!request) return false;

    request.remindersPaused = true;
    request.updatedAt = new Date().toISOString();

    const client = data.clients.find(c => c.id === request.clientId);
    data.activityLogs.unshift({
      id: `act_${Date.now()}_pause`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'reminders_paused',
      description: `${actorName} paused automated reminders for "${request.name}" (${client ? client.companyName : 'Client'})`,
      actorType: 'accountant',
      actorName,
      createdAt: new Date().toISOString(),
    });

    db.commit();
    return true;
  }

  /**
   * Resumes automated reminders for a request.
   */
  public static resumeReminders(requestId: string, actorName = 'Accountant'): boolean {
    const data = db.getData();
    const request = data.requests.find(r => r.id === requestId);
    if (!request) return false;

    request.remindersPaused = false;
    request.updatedAt = new Date().toISOString();

    const client = data.clients.find(c => c.id === request.clientId);
    data.activityLogs.unshift({
      id: `act_${Date.now()}_resume`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'reminders_resumed',
      description: `${actorName} resumed automated reminders for "${request.name}" (${client ? client.companyName : 'Client'})`,
      actorType: 'accountant',
      actorName,
      createdAt: new Date().toISOString(),
    });

    db.commit();
    return true;
  }

  /**
   * Runs the automated chasing engine across all active and overdue requests.
   */
  public static async runBatch(firmId?: string): Promise<{
    processedCount: number;
    sentCount: number;
    completedCount: number;
    skippedCount: number;
    results: SendReminderResult[];
  }> {
    const data = db.getData();
    let eligibleRequests = data.requests.filter(
      r => r.status === 'Active' || r.status === 'Overdue'
    );
    if (firmId) {
      eligibleRequests = eligibleRequests.filter(r => r.firmId === firmId);
    }

    let processedCount = 0;
    let sentCount = 0;
    let completedCount = 0;
    let skippedCount = 0;
    const results: SendReminderResult[] = [];

    for (const req of eligibleRequests) {
      processedCount++;
      const evaluation = this.evaluateRequest(req.id);
      if (evaluation?.isComplete) {
        completedCount++;
        continue;
      }

      if (evaluation?.shouldSendReminder) {
        const result = await this.sendReminder(req.id, { triggerType: 'automated' });
        results.push(result);
        if (result.sent) {
          sentCount++;
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    return {
      processedCount,
      sentCount,
      completedCount,
      skippedCount,
      results,
    };
  }
}
