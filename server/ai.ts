import { GoogleGenAI } from '@google/genai';

export interface AIServiceSuggestions {
  suggestedRequirements: Array<{ name: string; description: string; required: boolean }>;
  tips: string[];
}

export interface AIReminderDraft {
  subject: string;
  body: string;
}

export class AIService {
  private aiClient: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        this.aiClient = new GoogleGenAI({ apiKey });
      } catch (err) {
        console.warn('Failed to initialize GoogleGenAI client:', err);
      }
    }
  }

  public isAvailable(): boolean {
    return this.aiClient !== null;
  }

  public async suggestRequirements(context: {
    requestName: string;
    period?: string;
    existingItems: string[];
  }): Promise<AIServiceSuggestions> {
    const lowerName = context.requestName.toLowerCase();

    // Default intelligent domain-specific suggestions for UK accounting
    if (this.aiClient) {
      try {
        const prompt = `You are an expert UK Chartered Accountant. The user is creating a document request titled "${context.requestName}" for period "${context.period || 'current'}".
The current checklist already has: ${JSON.stringify(context.existingItems)}.
Suggest 3-5 complementary documents that an accountant commonly needs from the client for this engagement.
Respond ONLY with a JSON object format:
{
  "suggestedRequirements": [
    { "name": "Document title", "description": "Clear explanation of what to upload", "required": true }
  ],
  "tips": ["One actionable tip for obtaining this cleanly"]
}`;
        const response = await this.aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        if (response.text) {
          const parsed = JSON.parse(response.text);
          return parsed;
        }
      } catch (err) {
        console.warn('Gemini suggestion failed, using domain heuristics:', err);
      }
    }

    // Heuristics fallback
    if (lowerName.includes('vat')) {
      return {
        suggestedRequirements: [
          { name: 'C79 Customs Import Certificate', description: 'Import VAT certificate issued directly by HMRC if goods were imported.', required: false },
          { name: 'EC Sales List & Export Documentation', description: 'Proof of export for zero-rated overseas supplies.', required: false },
          { name: 'Fuel Scale Charge Records', description: 'Mileage logs if claiming road fuel VAT on commercial or private vehicles.', required: false }
        ],
        tips: ['Ensure purchase invoices show the supplier VAT registration number.']
      };
    } else if (lowerName.includes('year') || lowerName.includes('statutory') || lowerName.includes('tax')) {
      return {
        suggestedRequirements: [
          { name: 'Capital Asset Purchase Agreements', description: 'Invoices for machinery, computers or vehicles purchased over £500.', required: true },
          { name: 'Pension Scheme Annual Summary', description: 'Confirmation of auto-enrolment employer and employee contributions paid.', required: true },
          { name: 'Year-End Stock Certificate', description: 'Stock take evaluation breakdown as of financial year end date.', required: false }
        ],
        tips: ['Requesting loan statements early prevents reconciliation delays.']
      };
    } else {
      return {
        suggestedRequirements: [
          { name: 'Credit Card Full Statement', description: 'Full monthly itemised statement showing all cardholder charges.', required: true },
          { name: 'HMRC PAYE Payment Confirmation', description: 'Bank proof of monthly PAYE/NIC payment transferred to HMRC.', required: true },
          { name: 'Petty Cash Voucher Summary', description: 'Spreadsheet or envelope photos of small out-of-pocket cash receipts.', required: false }
        ],
        tips: ['Remind clients that bank export CSVs paired with PDFs make bookkeeping 3x faster.']
      };
    }
  }

  public async draftReminder(context: {
    clientName: string;
    requestName: string;
    missingDocs: string[];
    tone: 'polite' | 'firm' | 'urgent';
  }): Promise<AIReminderDraft> {
    if (this.aiClient) {
      try {
        const prompt = `Draft a concise, professional reminder email from an accounting firm to client "${context.clientName}" about missing documents for "${context.requestName}".
Missing items: ${context.missingDocs.join(', ')}.
Tone: ${context.tone} (UK business professional).
Include placeholder {{portal_link}} where the client should click to upload.
Respond ONLY with a JSON object:
{
  "subject": "email subject line",
  "body": "email body text"
}`;
        const response = await this.aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        if (response.text) {
          return JSON.parse(response.text);
        }
      } catch (err) {
        console.warn('Gemini reminder drafting failed, using rule engine:', err);
      }
    }

    const itemsList = context.missingDocs.map(d => `• ${d}`).join('\n');
    if (context.tone === 'urgent') {
      return {
        subject: `URGENT: Outstanding documents required for ${context.requestName}`,
        body: `Dear ${context.clientName},\n\nWe urgently require the following documents to prevent statutory filing penalties for ${context.requestName}:\n\n${itemsList}\n\nPlease upload them directly to your secure portal now:\n{{portal_link}}\n\nKind regards,\nYour Accounting Team`
      };
    } else if (context.tone === 'firm') {
      return {
        subject: `Documents still required: ${context.requestName}`,
        body: `Hi ${context.clientName},\n\nWe are currently blocked from progressing your ${context.requestName} because the following documents are still missing:\n\n${itemsList}\n\nPlease submit these via your secure portal so we can proceed:\n{{portal_link}}\n\nMany thanks,\nYour Accounting Team`
      };
    } else {
      return {
        subject: `Gentle reminder: documents needed for ${context.requestName}`,
        body: `Hi ${context.clientName},\n\nHope your week is going well. Just a quick reminder to upload your outstanding documents for ${context.requestName}:\n\n${itemsList}\n\nYou can easily drop them into your portal here:\n{{portal_link}}\n\nThanks for your help,\nYour Accounting Team`
      };
    }
  }
}

export const aiService = new AIService();
