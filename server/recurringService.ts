import crypto from 'crypto';
import { db } from './storage.js';
import { PortalSecurityService } from './portalSecurity.js';
import {
  RecurringSchedule,
  RecurringFrequency,
  DueDateRule,
  PeriodHistoryEntry,
  DocumentRequest,
  DocumentRequirement,
  Template,
} from './types.js';

export class RecurringService {
  /**
   * Calculates a human-readable period identifier based on frequency and date.
   * Examples:
   * - Monthly: "January 2027", "February 2027", "March 2027"
   * - Quarterly: "Q1 2027", "Q2 2027", "Q3 2027", "Q4 2027"
   * - Annual: "FY 2027", "FY 2028"
   */
  public static calculatePeriodName(frequency: RecurringFrequency, date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    switch (frequency) {
      case 'Monthly':
        return `${monthNames[month]} ${year}`;
      case 'Quarterly': {
        const quarter = Math.floor(month / 3) + 1;
        return `Q${quarter} ${year}`;
      }
      case 'Annual':
        return `FY ${year}`;
      case 'One-off':
      default:
        return `${monthNames[month]} ${year}`;
    }
  }

  /**
   * Advances the occurrence date to the next cycle based on frequency.
   * Format: YYYY-MM-DD
   */
  public static calculateNextOccurrence(frequency: RecurringFrequency, currentDateStr: string): string {
    const [year, month, day] = currentDateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    switch (frequency) {
      case 'Monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'Quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'Annual':
        date.setFullYear(date.getFullYear() + 1);
        break;
      case 'One-off':
      default:
        date.setMonth(date.getMonth() + 1);
        break;
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Calculates the due date for a request based on occurrence date and due-date rule.
   */
  public static calculateDueDate(occurrenceDateStr: string, rule: DueDateRule): string {
    const [year, month, day] = occurrenceDateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    switch (rule.type) {
      case 'days_after_start':
        date.setDate(date.getDate() + (rule.daysOffset || 14));
        break;
      case 'day_of_month': {
        const targetDay = Math.min(rule.daysOffset || 15, 28);
        date.setDate(targetDay);
        // If target day is before or equal to occurrence, move to next month
        if (targetDay <= day) {
          date.setMonth(date.getMonth() + 1);
        }
        break;
      }
      case 'end_of_month':
        // Last day of current month
        date.setMonth(date.getMonth() + 1, 0);
        break;
      default:
        date.setDate(date.getDate() + 14);
        break;
    }

    return date.toISOString().split('T')[0];
  }

  /**
   * Checks whether a request already exists for the given recurring schedule and period.
   * STRICT DUPLICATE PREVENTION.
   */
  public static hasDuplicateRequest(firmId: string, clientId: string, scheduleId: string, period: string): boolean {
    const data = db.getData();
    return data.requests.some(
      r => r.firmId === firmId &&
           r.clientId === clientId &&
           r.recurringScheduleId === scheduleId &&
           r.period.trim().toLowerCase() === period.trim().toLowerCase()
    );
  }

  /**
   * Generates a new document request for a recurring schedule.
   * Enforces duplicate prevention and timing rules.
   */
  public static generateRequestForSchedule(
    scheduleId: string,
    firmId: string,
    options: { force?: boolean; actorName?: string; targetOccurrenceDate?: string } = {}
  ): { success: boolean; request?: DocumentRequest; message: string; code?: string } {
    const data = db.getData();

    // STRICT TENANT ISOLATION
    const schedule = data.recurringSchedules.find(s => s.id === scheduleId && s.firmId === firmId);
    if (!schedule) {
      return { success: false, message: 'Recurring schedule not found.', code: 'SCHEDULE_NOT_FOUND' };
    }

    if (!options.force && schedule.status !== 'Active') {
      return {
        success: false,
        message: `Recurring schedule is currently ${schedule.status}. Resume it before generating requests.`,
        code: 'SCHEDULE_INACTIVE',
      };
    }

    const occurrenceDate = options.targetOccurrenceDate || schedule.nextOccurrence;
    const periodName = this.calculatePeriodName(schedule.frequency, occurrenceDate);

    // PREVENT DUPLICATE GENERATION
    if (this.hasDuplicateRequest(firmId, schedule.clientId, schedule.id, periodName)) {
      return {
        success: false,
        message: `A document request for "${periodName}" already exists for this client. Duplicate generation was prevented.`,
        code: 'DUPLICATE_PERIOD_PREVENTED',
      };
    }

    const client = data.clients.find(c => c.id === schedule.clientId && c.firmId === firmId);
    if (!client) {
      return { success: false, message: 'Client associated with schedule not found.', code: 'CLIENT_NOT_FOUND' };
    }

    const template = data.templates.find(t => t.id === schedule.templateId && t.firmId === firmId);

    // Compute due date
    const dueDate = this.calculateDueDate(occurrenceDate, schedule.dueDateRule);

    // Generate cryptographically secure portal token
    const requestId = `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const portalToken = PortalSecurityService.generateSecureToken();
    const portalTokenHash = PortalSecurityService.hashToken(portalToken);
    const portalTokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const newRequest: DocumentRequest = {
      id: requestId,
      firmId,
      clientId: schedule.clientId,
      recurringScheduleId: schedule.id,
      name: `${schedule.name} — ${periodName}`,
      description: schedule.description || `Automated recurring request for ${periodName}`,
      period: periodName,
      dueDate,
      reminderFrequencyDays: schedule.reminderFrequencyDays || 3,
      maxReminders: schedule.maxReminders || 5,
      remindersPaused: false,
      status: 'Active',
      portalToken,
      portalTokenHash,
      portalTokenExpiresAt,
      portalTokenRevoked: false,
      reminderCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.requests.unshift(newRequest);

    // Copy template requirements or add fallback requirement
    if (template && template.requirements && template.requirements.length > 0) {
      template.requirements.forEach((tr, idx) => {
        const reqItem: DocumentRequirement = {
          id: `rq_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
          requestId,
          name: tr.name,
          description: tr.description || '',
          required: tr.required !== false,
          status: 'Missing',
          updatedAt: new Date().toISOString(),
        };
        data.requirements.push(reqItem);
      });
    } else {
      data.requirements.push({
        id: `rq_${Date.now()}_0`,
        requestId,
        name: 'Supporting Financial Records',
        description: `Please provide all relevant financial records for ${periodName}`,
        required: true,
        status: 'Missing',
        updatedAt: new Date().toISOString(),
      });
    }

    // Advance schedule next occurrence and update metadata
    schedule.lastGeneratedPeriod = periodName;
    schedule.lastGeneratedAt = new Date().toISOString();
    schedule.nextOccurrence = this.calculateNextOccurrence(schedule.frequency, occurrenceDate);
    schedule.updatedAt = new Date().toISOString();

    // Audit Trail: Record generation
    const actor = options.actorName || 'Automated Scheduler';
    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId,
      requestId,
      clientId: schedule.clientId,
      action: 'recurring_request_generated',
      description: `${actor} generated recurring request "${newRequest.name}" for ${client.companyName}`,
      actorType: options.actorName ? 'accountant' : 'system',
      actorName: actor,
      createdAt: new Date().toISOString(),
    });

    db.commit();

    return {
      success: true,
      request: newRequest,
      message: `Successfully generated request "${newRequest.name}". Next scheduled period: ${this.calculatePeriodName(schedule.frequency, schedule.nextOccurrence)}.`,
    };
  }

  /**
   * Builds the period history and status breakdown for a recurring schedule.
   * Example:
   * January 2027 — Complete
   * February 2027 — Complete
   * March 2027 — Waiting
   * April 2027 — Not started
   */
  public static getPeriodHistory(schedule: RecurringSchedule): PeriodHistoryEntry[] {
    const data = db.getData();
    const history: PeriodHistoryEntry[] = [];

    // Find all existing requests generated by this recurring schedule
    const linkedRequests = data.requests
      .filter(r => r.firmId === schedule.firmId && r.recurringScheduleId === schedule.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const req of linkedRequests) {
      const reqRequirements = data.requirements.filter(rq => rq.requestId === req.id);
      const total = reqRequirements.length;
      const received = reqRequirements.filter(rq => rq.status === 'Uploaded' || rq.status === 'Approved').length;
      const pct = total > 0 ? Math.round((received / total) * 100) : 0;

      let status: 'Complete' | 'Waiting' | 'Overdue' = 'Waiting';
      const isPastDue = new Date(req.dueDate) < new Date();

      if (req.status === 'Completed' || (total > 0 && received === total)) {
        status = 'Complete';
      } else if (isPastDue) {
        status = 'Overdue';
      } else {
        status = 'Waiting';
      }

      history.push({
        period: req.period,
        requestId: req.id,
        status,
        dueDate: req.dueDate,
        generatedAt: req.createdAt,
        percentage: pct,
      });
    }

    // Add upcoming period (Not started) if schedule is active
    if (schedule.status !== 'Stopped') {
      const nextPeriod = this.calculatePeriodName(schedule.frequency, schedule.nextOccurrence);
      // Ensure upcoming period isn't already in history
      if (!history.some(h => h.period === nextPeriod)) {
        history.push({
          period: nextPeriod,
          status: 'Not started',
          dueDate: this.calculateDueDate(schedule.nextOccurrence, schedule.dueDateRule),
        });
      }
    }

    return history;
  }

  /**
   * Processes all active recurring schedules across all firms that are due on or before today.
   * Only generates requests when the schedule timing requires it.
   */
  public static processDueSchedules(): { generatedCount: number; processedCount: number; requests: DocumentRequest[] } {
    const data = db.getData();
    const todayStr = new Date().toISOString().split('T')[0];
    const generated: DocumentRequest[] = [];
    let processed = 0;

    for (const schedule of data.recurringSchedules) {
      if (schedule.status !== 'Active') continue;

      // DO NOT create next period until appropriate schedule requires it (nextOccurrence <= today)
      if (schedule.nextOccurrence <= todayStr) {
        processed++;
        const result = this.generateRequestForSchedule(schedule.id, schedule.firmId, {
          force: false,
          actorName: 'Automated Scheduler',
        });

        if (result.success && result.request) {
          generated.push(result.request);
        }
      }
    }

    return {
      generatedCount: generated.length,
      processedCount: processed,
      requests: generated,
    };
  }
}
