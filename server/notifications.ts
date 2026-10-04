import { db } from './storage.js';
import { Reminder, ActivityLog } from './types.js';

export interface SendNotificationPayload {
  to: string;
  recipientName: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  deliveryStatus: 'sent' | 'delivered' | 'failed' | 'simulated';
  provider: string;
  timestamp: string;
  error?: string;
}

/**
 * Service Abstraction for Notification Delivery
 * Pluggable provider interface decoupling DocumentChaser from any specific email provider.
 */
export interface INotificationProvider {
  readonly name: string;
  readonly type: 'development' | 'production' | 'smtp' | 'webhook';
  send(payload: SendNotificationPayload): Promise<NotificationResult>;
}

/**
 * Development Notification Provider
 * Records simulated notifications to activity logs and console without sending external email.
 */
export class DevelopmentNotificationProvider implements INotificationProvider {
  public readonly name = 'Development In-App Logger (Simulated)';
  public readonly type = 'development' as const;

  public async send(payload: SendNotificationPayload): Promise<NotificationResult> {
    const messageId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    console.log(`\n======================================================`);
    console.log(`[DocumentChaser Simulated Notification (${this.name})]`);
    console.log(`To: ${payload.recipientName} <${payload.to}>`);
    console.log(`Subject: ${payload.subject}`);
    console.log(`Message ID: ${messageId}`);
    if (payload.idempotencyKey) {
      console.log(`Idempotency Key: ${payload.idempotencyKey}`);
    }
    console.log(`------------------------------------------------------`);
    console.log(payload.body);
    console.log(`======================================================\n`);

    return {
      success: true,
      messageId,
      deliveryStatus: 'simulated',
      provider: this.name,
      timestamp,
    };
  }
}

/**
 * Generic Webhook / REST Provider
 * Pluggable provider ready for HTTP-based notification services (Resend, SendGrid, Postmark, AWS SES, or custom webhooks)
 */
export class WebhookNotificationProvider implements INotificationProvider {
  public readonly name: string;
  public readonly type = 'webhook' as const;
  private endpointUrl: string;
  private apiKey?: string;

  constructor(name: string, endpointUrl: string, apiKey?: string) {
    this.name = name;
    this.endpointUrl = endpointUrl;
    this.apiKey = apiKey;
  }

  public async send(payload: SendNotificationPayload): Promise<NotificationResult> {
    const timestamp = new Date().toISOString();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      if (payload.idempotencyKey) {
        headers['Idempotency-Key'] = payload.idempotencyKey;
      }

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        return {
          success: false,
          deliveryStatus: 'failed',
          provider: this.name,
          timestamp,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const resData = await response.json().catch(() => ({}));
      return {
        success: true,
        messageId: resData.id || `wh_${Date.now()}`,
        deliveryStatus: 'delivered',
        provider: this.name,
        timestamp,
      };
    } catch (err: any) {
      return {
        success: false,
        deliveryStatus: 'failed',
        provider: this.name,
        timestamp,
        error: err.message || 'Network request failed',
      };
    }
  }
}

/**
 * Test Mock Provider for Simulating Failures and Retries in Automated Tests
 */
export class MockTestNotificationProvider implements INotificationProvider {
  public readonly name = 'Automated Test Mock Provider';
  public readonly type = 'development' as const;
  public failNextCount = 0;
  public callCount = 0;
  public sentPayloads: SendNotificationPayload[] = [];

  public async send(payload: SendNotificationPayload): Promise<NotificationResult> {
    this.callCount++;
    this.sentPayloads.push(payload);
    const timestamp = new Date().toISOString();

    if (this.failNextCount > 0) {
      this.failNextCount--;
      return {
        success: false,
        deliveryStatus: 'failed',
        provider: this.name,
        timestamp,
        error: 'Simulated transient connection failure',
      };
    }

    return {
      success: true,
      messageId: `mock_${Date.now()}_${this.callCount}`,
      deliveryStatus: 'simulated',
      provider: this.name,
      timestamp,
    };
  }
}

/**
 * Unified Notification Service
 * Orchestrates provider dispatching with automatic retries and error handling.
 */
export class NotificationService {
  private provider: INotificationProvider;

  constructor(provider?: INotificationProvider) {
    this.provider = provider || new DevelopmentNotificationProvider();
  }

  public setProvider(provider: INotificationProvider) {
    this.provider = provider;
  }

  public getProvider(): INotificationProvider {
    return this.provider;
  }

  public getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Dispatches email notification with retry-safe behaviour (up to 3 attempts with exponential backoff on transient errors).
   */
  public async sendEmailWithRetry(
    payload: SendNotificationPayload,
    maxRetries = 2
  ): Promise<NotificationResult> {
    let lastResult: NotificationResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.provider.send(payload);
        if (result.success) {
          return result;
        }
        lastResult = result;
      } catch (err: any) {
        lastResult = {
          success: false,
          deliveryStatus: 'failed',
          provider: this.provider.name,
          timestamp: new Date().toISOString(),
          error: err.message,
        };
      }

      // If attempts remain, wait brief backoff before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 50 * Math.pow(2, attempt)));
      }
    }

    return (
      lastResult || {
        success: false,
        deliveryStatus: 'failed',
        provider: this.provider.name,
        timestamp: new Date().toISOString(),
        error: 'Unknown error after retries',
      }
    );
  }

  public formatTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }
}

export const notificationService = new NotificationService();
