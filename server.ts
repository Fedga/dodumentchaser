import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { db } from './server/storage.js';
import { notificationService } from './server/notifications.js';
import { aiService } from './server/ai.js';
import { AuthService, requireAuth, requireRole } from './server/auth.js';
import { PortalSecurityService } from './server/portalSecurity.js';
import { DocumentStorageService, StorageValidationError } from './server/documentStorage.js';
import { RecurringService } from './server/recurringService.js';
import { ChasingEngine } from './server/chasingEngine.js';
import { DocumentRequest, DocumentRequirement, DocumentFile, ActivityLog, User, RecurringSchedule } from './server/types.js';
import { dbService } from './server/db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper: Calculate request completion metrics
function calculateRequestStats(requestId: string) {
  const data = db.getData();
  const reqItems = data.requirements.filter(r => r.requestId === requestId);
  const totalCount = reqItems.length;
  const receivedCount = reqItems.filter(r => r.status === 'Approved' || r.status === 'Uploaded' || r.status === 'Not applicable').length;
  const missingCount = reqItems.filter(r => r.status === 'Missing' || r.status === 'Requested' || r.status === 'Rejected').length;
  const requiredMissingCount = reqItems.filter(r => r.required && (r.status === 'Missing' || r.status === 'Requested' || r.status === 'Rejected')).length;
  const percentage = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;
  return { totalCount, receivedCount, missingCount, requiredMissingCount, percentage };
}

// ----------------------------------------------------
// AUTHENTICATION ROUTES
// ----------------------------------------------------

// Login endpoint
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, userId } = req.body;
  const data = db.getData();

  let user: User | undefined;
  if (userId) {
    user = data.users.find(u => u.id === userId);
  } else if (email) {
    user = data.users.find(u => u.email.toLowerCase() === String(email).toLowerCase());
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. User not found.', code: 'INVALID_CREDENTIALS' });
  }

  const firm = data.firms.find(f => f.id === user.firmId);
  if (!firm) {
    return res.status(401).json({ error: 'Associated firm not found.', code: 'FIRM_NOT_FOUND' });
  }

  const session = AuthService.createSession(user);

  // Set HTTP-only cookie as well for seamless browser navigation
  res.cookie('dc_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    token: session.token,
    user,
    firm,
  });
});

// Logout endpoint
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = AuthService.extractToken(req);
  if (token) {
    AuthService.revokeSession(token);
  }
  res.clearCookie('dc_session');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Quick account switch endpoint (for testing/demoing multi-tenancy & RBAC)
app.post('/api/auth/switch', (req: Request, res: Response) => {
  const { userId } = req.body;
  const data = db.getData();
  const user = data.users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: 'Target user account not found.' });
  }

  const firm = data.firms.find(f => f.id === user.firmId);
  if (!firm) {
    return res.status(404).json({ error: 'Target firm not found.' });
  }

  const session = AuthService.createSession(user);

  res.cookie('dc_session', session.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    token: session.token,
    user,
    firm,
  });
});

// List available accounts for switching (testing helper)
app.get('/api/auth/accounts', (_req: Request, res: Response) => {
  const data = db.getData();
  const accounts = data.users.map(u => {
    const firm = data.firms.find(f => f.id === u.firmId);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      firmId: u.firmId,
      firmName: firm ? firm.name : 'Unknown Firm',
    };
  });
  res.json(accounts);
});

// Current authenticated user & firm
app.get('/api/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    user: req.user,
    firm: req.firm,
  });
});

// ----------------------------------------------------
// FIRM SETTINGS (Admin Role Required, Scoped to req.firm.id)
// ----------------------------------------------------
app.post('/api/firm', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  const data = db.getData();
  // Authoritative: ONLY find and update the authenticated user's firm!
  const firm = data.firms.find(f => f.id === req.firm!.id);
  if (!firm) return res.status(404).json({ error: 'Firm not found' });

  const { name, logoUrl, defaultReminderDays, defaultMaxReminders, defaultReminderSubject, defaultReminderBody, plan, manualChasingMinutesPerDoc } = req.body;
  if (name !== undefined) firm.name = name;
  if (logoUrl !== undefined) firm.logoUrl = logoUrl;
  if (defaultReminderDays !== undefined) firm.defaultReminderDays = Number(defaultReminderDays);
  if (defaultMaxReminders !== undefined) firm.defaultMaxReminders = Number(defaultMaxReminders);
  if (defaultReminderSubject !== undefined) firm.defaultReminderSubject = defaultReminderSubject;
  if (defaultReminderBody !== undefined) firm.defaultReminderBody = defaultReminderBody;
  if (plan !== undefined) firm.plan = plan;
  if (manualChasingMinutesPerDoc !== undefined) firm.manualChasingMinutesPerDoc = Math.max(1, Number(manualChasingMinutesPerDoc) || 5);

  db.commit();
  res.json({ success: true, firm });
});

// Configure estimated manual chasing minutes per document
app.post('/api/firm/chasing-estimate', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firm = data.firms.find(f => f.id === req.firm!.id);
  if (!firm) return res.status(404).json({ error: 'Firm not found' });

  const { minutes } = req.body;
  const parsed = Number(minutes);
  if (isNaN(parsed) || parsed < 1 || parsed > 120) {
    return res.status(400).json({ error: 'Configured minutes must be a number between 1 and 120' });
  }

  firm.manualChasingMinutesPerDoc = Math.round(parsed);
  db.commit();
  res.json({ success: true, manualChasingMinutesPerDoc: firm.manualChasingMinutesPerDoc });
});

// ----------------------------------------------------
// DASHBOARD METRICS & CHASING INSIGHTS (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/stats', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const totalActiveClients = data.clients.filter(c => c.firmId === firmId && c.status === 'Active').length;
  const totalClients = data.clients.filter(c => c.firmId === firmId && c.status !== 'Archived').length;
  const activeRequests = data.requests.filter(r => r.firmId === firmId && (r.status === 'Active' || r.status === 'Overdue'));
  const overdueRequests = data.requests.filter(r => r.firmId === firmId && r.status === 'Overdue').length;

  let totalMissing = 0;
  for (const r of activeRequests) {
    const stats = calculateRequestStats(r.id);
    totalMissing += stats.missingCount;
  }

  // Current month calculation
  const now = new Date();
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth();
  const isThisMonth = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getUTCFullYear() === curYear && d.getUTCMonth() === curMonth;
  };

  // Completed requests this month
  const firmCompletedRequests = data.requests.filter(r => r.firmId === firmId && r.status === 'Completed');
  const requestsCompletedThisMonth = firmCompletedRequests.filter(r => {
    const targetDate = r.completedAt || r.updatedAt;
    return targetDate && isThisMonth(targetDate);
  }).length;

  // Documents collected this month
  const firmDocs = data.documents.filter(d => d.firmId === firmId && (d.status === 'Approved' || d.status === 'Uploaded'));
  const documentsCollectedThisMonth = firmDocs.filter(d => isThisMonth(d.uploadedAt)).length;

  // Automated reminders sent for this firm
  const automatedRemindersSent = data.reminders.filter(rem => rem.firmId === firmId && rem.triggerType === 'automated').length;

  // Clients currently being actively chased (unique clients with active requests that have missing items and unpaused reminders)
  const activeChasedClientIds = new Set<string>();
  for (const req of activeRequests) {
    if (req.remindersPaused) continue;
    if (req.maxReminders > 0 && req.maxReminders < 999 && (req.reminderCount || 0) >= req.maxReminders) continue;
    const evaluation = ChasingEngine.evaluateRequest(req.id);
    if (evaluation && !evaluation.isComplete && evaluation.missingRequiredDocs.length > 0) {
      activeChasedClientIds.add(req.clientId);
    }
  }
  const clientsCurrentlyBeingChased = activeChasedClientIds.size;

  // ----------------------------------------------------
  // CHASING INSIGHTS FACTUAL METRICS (Strictly firmId isolated)
  // ----------------------------------------------------
  const remindersSent = data.reminders.filter(rem => rem.firmId === firmId).length;
  const documentsCollected = firmDocs.length;
  const requestsCompleted = firmCompletedRequests.length;

  // Average request completion time
  let totalCompletionMs = 0;
  let validCompletions = 0;
  for (const r of firmCompletedRequests) {
    const start = new Date(r.createdAt).getTime();
    const end = new Date(r.completedAt || r.updatedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      totalCompletionMs += (end - start);
      validCompletions++;
    }
  }

  let averageRequestCompletionTime = '—';
  let averageRequestCompletionDays = 0;
  if (validCompletions > 0) {
    const avgHours = (totalCompletionMs / validCompletions) / (1000 * 60 * 60);
    const avgDays = avgHours / 24;
    averageRequestCompletionDays = Math.round(avgDays * 10) / 10;
    if (avgDays >= 1) {
      averageRequestCompletionTime = `${averageRequestCompletionDays} ${averageRequestCompletionDays === 1 ? 'day' : 'days'}`;
    } else {
      const roundedHours = Math.round(avgHours * 10) / 10;
      averageRequestCompletionTime = `${roundedHours} ${roundedHours === 1 ? 'hour' : 'hours'}`;
    }
  }

  // Average reminders per completed request
  const totalRemindersOnCompleted = firmCompletedRequests.reduce((sum, r) => sum + (r.reminderCount || 0), 0);
  const averageRemindersPerCompletedRequest = firmCompletedRequests.length > 0
    ? Math.round((totalRemindersOnCompleted / firmCompletedRequests.length) * 10) / 10
    : 0;

  // Automatically resolved missing-document interactions
  const firmReqIds = new Set(data.requests.filter(r => r.firmId === firmId).map(r => r.id));
  const automaticallyResolvedInteractions = data.requirements.filter(
    rq => firmReqIds.has(rq.requestId) && (rq.status === 'Approved' || rq.status === 'Uploaded')
  ).length;

  const firmRecord = data.firms.find(f => f.id === firmId);
  const configuredMinutesPerDocument = firmRecord?.manualChasingMinutesPerDoc !== undefined
    ? Number(firmRecord.manualChasingMinutesPerDoc)
    : 5;

  const estimatedMinutesSaved = automaticallyResolvedInteractions * configuredMinutesPerDocument;
  const estimatedHoursSaved = Math.round((estimatedMinutesSaved / 60) * 10) / 10;

  res.json({
    totalClients,
    totalActiveClients,
    outstandingRequests: activeRequests.length,
    documentsAwaitingClient: totalMissing,
    completedThisMonth: requestsCompletedThisMonth,
    requestsCompletedThisMonth,
    overdueRequests,
    documentsCollectedThisMonth,
    automatedRemindersSent,
    clientsCurrentlyBeingChased,
    // Chasing Insights
    remindersSent,
    documentsCollected,
    requestsCompleted,
    averageRequestCompletionTime,
    averageRequestCompletionDays,
    averageRemindersPerCompletedRequest,
    automaticallyResolvedInteractions,
    configuredMinutesPerDocument,
    estimatedMinutesSaved,
    estimatedHoursSaved,
  });
});

// ----------------------------------------------------
// CLIENTS (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/clients', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const search = (req.query.search as string || '').toLowerCase();
  const status = req.query.status as string;

  // STRICT TENANT ISOLATION: filter by firmId first!
  let clients = data.clients
    .filter(c => c.firmId === firmId)
    .map(c => {
      const clientRequests = data.requests.filter(r => r.clientId === c.id && r.firmId === firmId);
      const activeReqs = clientRequests.filter(r => r.status === 'Active' || r.status === 'Overdue');
      let missingDocs = 0;
      for (const r of activeReqs) {
        const s = calculateRequestStats(r.id);
        missingDocs += s.missingCount;
      }
      const staff = data.users.find(u => u.id === c.assignedStaffId && u.firmId === firmId);
      return {
        ...c,
        activeRequestsCount: activeReqs.length,
        missingDocumentsCount: missingDocs,
        assignedStaffName: staff ? staff.name : 'Unassigned',
      };
    });

  if (search) {
    clients = clients.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.companyName.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search)
    );
  }

  if (status && status !== 'All') {
    clients = clients.filter(c => c.status === status);
  }

  res.json(clients);
});

app.get('/api/clients/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: check client belongs to authenticated firm!
  const client = data.clients.find(c => c.id === req.params.id && c.firmId === firmId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const requests = data.requests
    .filter(r => r.clientId === client.id && r.firmId === firmId)
    .map(r => ({
      ...r,
      stats: calculateRequestStats(r.id),
    }));

  const activeRequests = requests.filter(r => r.status === 'Active' || r.status === 'Overdue');
  const completedRequests = requests.filter(r => r.status === 'Completed');

  const activeReqIds = activeRequests.map(r => r.id);
  const outstandingRequirements = data.requirements
    .filter(rq => activeReqIds.includes(rq.requestId) && (rq.status === 'Missing' || rq.status === 'Requested' || rq.status === 'Rejected'))
    .map(rq => {
      const parentReq = activeRequests.find(r => r.id === rq.requestId);
      return {
        ...rq,
        requestName: parentReq ? parentReq.name : '',
      };
    });

  const clientActivity = data.activityLogs.filter(a => a.clientId === client.id && a.firmId === firmId).slice(0, 10);
  const staff = data.users.find(u => u.id === client.assignedStaffId && u.firmId === firmId);

  res.json({
    ...client,
    assignedStaffName: staff ? staff.name : 'Unassigned',
    activeRequests,
    completedRequests,
    outstandingRequirements,
    activity: clientActivity,
  });
});

app.post('/api/clients', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const { name, companyName, email, phone, status, assignedStaffId, notes } = req.body;

  if (!name || !companyName || !email) {
    return res.status(400).json({ error: 'Client name, company name, and email are required.' });
  }

  // Validate that assignedStaffId belongs to the same firm if specified
  const firmId = req.firm!.id;
  let finalStaffId = req.user!.id;
  if (assignedStaffId) {
    const validStaff = data.users.find(u => u.id === assignedStaffId && u.firmId === firmId);
    if (validStaff) {
      finalStaffId = validStaff.id;
    }
  }

  // STRICT TENANT ISOLATION: firmId derived exclusively from authenticated session!
  const newClient = {
    id: `client_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    firmId,
    name,
    companyName,
    email,
    phone: phone || '',
    status: (status || 'Active') as any,
    assignedStaffId: finalStaffId,
    notes: notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.clients.unshift(newClient);

  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: newClient.id,
    action: 'client_created',
    description: `Added new client ${companyName} (${name})`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.status(201).json(newClient);
});

app.put('/api/clients/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const client = data.clients.find(c => c.id === req.params.id && c.firmId === firmId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { name, companyName, email, phone, status, assignedStaffId, notes } = req.body;
  if (name !== undefined) client.name = name;
  if (companyName !== undefined) client.companyName = companyName;
  if (email !== undefined) client.email = email;
  if (phone !== undefined) client.phone = phone;
  if (status !== undefined) client.status = status;
  if (assignedStaffId !== undefined) {
    const validStaff = data.users.find(u => u.id === assignedStaffId && u.firmId === firmId);
    if (validStaff) client.assignedStaffId = validStaff.id;
  }
  if (notes !== undefined) client.notes = notes;
  client.updatedAt = new Date().toISOString();

  db.commit();
  res.json(client);
});

app.post('/api/clients/:id/archive', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const client = data.clients.find(c => c.id === req.params.id && c.firmId === firmId);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.status = 'Archived';
  client.updatedAt = new Date().toISOString();
  db.commit();
  res.json({ success: true, client });
});

// ----------------------------------------------------
// DOCUMENT REQUESTS (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/requests', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const search = (req.query.search as string || '').toLowerCase();
  const status = req.query.status as string;
  const clientId = req.query.clientId as string;

  // STRICT TENANT ISOLATION
  let requests = data.requests
    .filter(r => r.firmId === firmId)
    .map(r => {
      const client = data.clients.find(c => c.id === r.clientId && c.firmId === firmId);
      const stats = calculateRequestStats(r.id);
      return {
        ...r,
        clientName: client ? client.name : 'Unknown',
        companyName: client ? client.companyName : 'Unknown',
        clientEmail: client ? client.email : '',
        stats,
      };
    });

  if (clientId) {
    requests = requests.filter(r => r.clientId === clientId);
  }

  if (search) {
    requests = requests.filter(r =>
      r.name.toLowerCase().includes(search) ||
      r.companyName.toLowerCase().includes(search) ||
      r.period.toLowerCase().includes(search)
    );
  }

  if (status && status !== 'All') {
    if (status === 'Missing') {
      requests = requests.filter(r => (r.status === 'Active' || r.status === 'Overdue') && (r.stats?.missingCount || 0) > 0);
    } else {
      requests = requests.filter(r => r.status === status);
    }
  }

  res.json(requests);
});

app.get('/api/requests/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const client = data.clients.find(c => c.id === request.clientId && c.firmId === firmId);
  const requirements = data.requirements
    .filter(rq => rq.requestId === request.id)
    .map(rq => {
      const doc = rq.uploadedDocumentId ? data.documents.find(d => d.id === rq.uploadedDocumentId && d.firmId === firmId) : undefined;
      return {
        ...rq,
        document: doc ? {
          id: doc.id,
          filename: doc.filename,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          status: doc.status,
          rejectionReason: doc.rejectionReason,
          uploadedAt: doc.uploadedAt,
          reviewedAt: doc.reviewedAt,
          reviewedBy: doc.reviewedBy,
        } : undefined,
      };
    });

  const reminders = data.reminders.filter(rem => rem.requestId === request.id && rem.firmId === firmId);
  const stats = calculateRequestStats(request.id);

  res.json({
    ...request,
    client,
    requirements,
    reminders,
    stats,
  });
});

app.post('/api/requests', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const {
    clientId,
    name,
    description,
    period,
    dueDate,
    reminderFrequencyDays,
    maxReminders,
    requirements: items,
    templateId,
    isRecurring,
    frequency,
    recurringScheduleId,
  } = req.body;

  if (!clientId || !name || !dueDate) {
    return res.status(400).json({ error: 'Client, request name, and due date are required.' });
  }

  // Cross-tenant check: verify target client belongs to authenticated firm!
  const client = data.clients.find(c => c.id === clientId && c.firmId === firmId);
  if (!client) {
    return res.status(404).json({ error: 'Selected client not found in your practice.' });
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  // Cryptographically secure random 256-bit token (dcpt_...)
  const portalToken = PortalSecurityService.generateSecureToken();
  const portalTokenHash = PortalSecurityService.hashToken(portalToken);
  const portalTokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // Default 60-day expiry

  const newRequest: DocumentRequest = {
    id: requestId,
    firmId,
    clientId,
    recurringScheduleId: recurringScheduleId || undefined,
    name,
    description: description || '',
    period: period || 'Current Period',
    dueDate,
    reminderFrequencyDays: Number(reminderFrequencyDays) || req.firm!.defaultReminderDays || 3,
    maxReminders: Number(maxReminders) || req.firm!.defaultMaxReminders || 5,
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

  // Add document requirements
  let finalRequirements: Array<{ name: string; description?: string; required?: boolean }> = items || [];
  if ((!finalRequirements || finalRequirements.length === 0) && templateId) {
    // Cross-tenant check: template must belong to authenticated firm
    const tmpl = data.templates.find(t => t.id === templateId && t.firmId === firmId);
    if (tmpl) {
      finalRequirements = tmpl.requirements;
    }
  }

  for (const item of finalRequirements) {
    data.requirements.push({
      id: `rq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      requestId,
      name: item.name,
      description: item.description || '',
      required: item.required !== false,
      status: 'Missing',
      updatedAt: new Date().toISOString(),
    });
  }

  // If this was marked as recurring, create the recurring schedule record
  if (isRecurring && frequency && frequency !== 'One-off') {
    const schedId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nextOccurrence = RecurringService.calculateNextOccurrence(frequency, dueDate);
    const schedule: RecurringSchedule = {
      id: schedId,
      firmId,
      clientId,
      templateId: templateId || '',
      name,
      description: description || '',
      frequency,
      nextOccurrence,
      dueDateRule: { type: 'days_after_start', daysOffset: 14 },
      reminderFrequencyDays: newRequest.reminderFrequencyDays,
      maxReminders: newRequest.maxReminders,
      status: 'Active',
      lastGeneratedPeriod: newRequest.period,
      lastGeneratedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    newRequest.recurringScheduleId = schedId;
    data.recurringSchedules.unshift(schedule);

    data.activityLogs.unshift({
      id: `act_${Date.now()}_sched`,
      firmId,
      clientId,
      action: 'recurring_schedule_created',
      description: `${req.user!.name} created recurring ${frequency} schedule "${name}" for ${client.companyName}`,
      actorType: 'accountant',
      actorName: req.user!.name,
      createdAt: new Date().toISOString(),
    });
  }

  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    requestId,
    clientId,
    action: 'request_created',
    description: `Created document request "${name}" for ${client.companyName} (${finalRequirements.length} documents requested)`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.status(201).json(newRequest);
});

app.put('/api/requests/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { name, description, period, dueDate, reminderFrequencyDays, maxReminders, remindersPaused, status } = req.body;
  if (name !== undefined) request.name = name;
  if (description !== undefined) request.description = description;
  if (period !== undefined) request.period = period;
  if (dueDate !== undefined) request.dueDate = dueDate;
  if (reminderFrequencyDays !== undefined) request.reminderFrequencyDays = Number(reminderFrequencyDays);
  if (maxReminders !== undefined) request.maxReminders = Number(maxReminders);
  if (remindersPaused !== undefined) request.remindersPaused = Boolean(remindersPaused);
  if (status !== undefined) request.status = status;
  request.updatedAt = new Date().toISOString();

  db.commit();
  res.json(request);
});

app.post('/api/requests/:id/close', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  request.status = 'Completed';
  request.updatedAt = new Date().toISOString();

  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    requestId: request.id,
    clientId: request.clientId,
    action: 'request_completed',
    description: `Request "${request.name}" was marked as completed and closed.`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, request });
});

// Trigger reminder for a request (manual chaser, tenant scoped)
app.post(['/api/requests/:id/remind', '/api/requests/:id/send-chaser'], requireAuth, async (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { idempotencyKey, force } = req.body || {};

  const result = await ChasingEngine.sendReminder(request.id, {
    force: force !== undefined ? Boolean(force) : true,
    triggerType: 'manual',
    actorName: req.user!.name,
    idempotencyKey: idempotencyKey || undefined,
  });

  if (!result.success && result.error) {
    return res.status(400).json({ error: result.error, reason: result.reason });
  }

  res.json({
    success: result.success,
    sent: result.sent,
    reminder: result.reminder,
    missingDocuments: result.missingDocuments,
    reason: result.reason,
  });
});

// Pause automated reminders
app.post('/api/requests/:id/pause-reminders', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const success = ChasingEngine.pauseReminders(request.id, req.user!.name);
  res.json({ success, remindersPaused: true });
});

// Resume automated reminders
app.post('/api/requests/:id/resume-reminders', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const success = ChasingEngine.resumeReminders(request.id, req.user!.name);
  res.json({ success, remindersPaused: false });
});

// Toggle automated reminders pause/resume
app.post('/api/requests/:id/toggle-reminders', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  if (request.remindersPaused) {
    ChasingEngine.resumeReminders(request.id, req.user!.name);
  } else {
    ChasingEngine.pauseReminders(request.id, req.user!.name);
  }

  res.json({ success: true, remindersPaused: request.remindersPaused });
});

// Rotate portal token (Accountant action, tenant scoped)
app.post('/api/requests/:id/portal-token/rotate', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { expiresInDays = 30 } = req.body;
  const rotationResult = PortalSecurityService.rotateToken(request, Number(expiresInDays) || 30, req.user!.name);

  const portalUrl = `${req.protocol}://${req.get('host')}/portal/${rotationResult.rawToken}`;

  res.json({
    success: true,
    portalToken: rotationResult.rawToken,
    portalUrl,
    expiresAt: rotationResult.expiresAt,
    message: 'Portal link successfully rotated. The previous link has been invalidated.',
  });
});

// Revoke portal token (Accountant action, tenant scoped)
app.post('/api/requests/:id/portal-token/revoke', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  PortalSecurityService.revokeToken(request, req.user!.name);

  res.json({
    success: true,
    message: 'Portal link has been revoked. Client access is now blocked.',
  });
});

// ----------------------------------------------------
// REQUIREMENTS & REVIEW (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.post('/api/requests/:id/requirements', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: verify request belongs to firm
  const request = data.requests.find(r => r.id === req.params.id && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const { name, description, required } = req.body;
  if (!name) return res.status(400).json({ error: 'Requirement name is required' });

  const newReq: DocumentRequirement = {
    id: `rq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    requestId: request.id,
    name,
    description: description || '',
    required: required !== false,
    status: 'Missing',
    updatedAt: new Date().toISOString(),
  };

  data.requirements.push(newReq);
  request.updatedAt = new Date().toISOString();
  db.commit();

  res.status(201).json(newReq);
});

app.delete('/api/requirements/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: find requirement and verify parent request belongs to firm
  const requirement = data.requirements.find(r => r.id === req.params.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

  const parentRequest = data.requests.find(r => r.id === requirement.requestId && r.firmId === firmId);
  if (!parentRequest) return res.status(404).json({ error: 'Requirement not found' });

  const index = data.requirements.indexOf(requirement);
  data.requirements.splice(index, 1);
  db.commit();
  res.json({ success: true });
});

app.post('/api/requirements/:id/approve', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: find requirement and verify parent request belongs to firm
  const requirement = data.requirements.find(r => r.id === req.params.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

  const request = data.requests.find(r => r.id === requirement.requestId && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Requirement not found' });

  requirement.status = 'Approved';
  requirement.rejectionReason = undefined;
  requirement.updatedAt = new Date().toISOString();

  if (requirement.uploadedDocumentId) {
    const doc = data.documents.find(d => d.id === requirement.uploadedDocumentId && d.firmId === firmId);
    if (doc) {
      doc.status = 'Approved';
      doc.reviewedAt = new Date().toISOString();
      doc.reviewedBy = req.user!.name;
    }
  }

  const stats = calculateRequestStats(request.id);
  if (stats.requiredMissingCount === 0 && stats.percentage === 100) {
    request.status = 'Completed';
  }
  request.updatedAt = new Date().toISOString();

  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    requestId: request.id,
    clientId: request.clientId,
    action: 'document_approved',
    description: `${req.user!.name} approved "${requirement.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  // Evaluate request state - automatically complete request if all required docs approved
  ChasingEngine.handleDocumentStateChanged(request.id);

  db.commit();
  res.json({ success: true, requirement });
});

app.post('/api/requirements/:id/reject', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: find requirement and verify parent request belongs to firm
  const requirement = data.requirements.find(r => r.id === req.params.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement not found' });

  const request = data.requests.find(r => r.id === requirement.requestId && r.firmId === firmId);
  if (!request) return res.status(404).json({ error: 'Requirement not found' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Rejection reason is required (e.g. "Bank statement is missing pages 3–4.")' });
  }

  requirement.status = 'Rejected';
  requirement.rejectionReason = reason;
  requirement.updatedAt = new Date().toISOString();

  if (requirement.uploadedDocumentId) {
    const doc = data.documents.find(d => d.id === requirement.uploadedDocumentId && d.firmId === firmId);
    if (doc) {
      doc.status = 'Rejected';
      doc.rejectionReason = reason;
      doc.reviewedAt = new Date().toISOString();
      doc.reviewedBy = req.user!.name;
    }
  }

  request.updatedAt = new Date().toISOString();

  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    requestId: request.id,
    clientId: request.clientId,
    action: 'document_rejected',
    description: `${req.user!.name} rejected "${requirement.name}": "${reason}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, requirement });
});

// ----------------------------------------------------
// CENTRAL DOCUMENTS REPOSITORY (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/documents', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const search = (req.query.search as string || '').toLowerCase();
  const status = req.query.status as string;
  const clientId = req.query.clientId as string;
  const requestId = req.query.requestId as string;

  // STRICT TENANT ISOLATION: filter by firmId
  let docs = data.documents
    .filter(d => d.firmId === firmId)
    .map(d => {
      const reqParent = data.requests.find(r => r.id === d.requestId && r.firmId === firmId);
      const client = reqParent ? data.clients.find(c => c.id === reqParent.clientId && c.firmId === firmId) : undefined;
      const reqItem = data.requirements.find(rq => rq.id === d.requirementId);

      return {
        id: d.id,
        filename: d.filename,
        originalName: d.originalName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        status: d.status,
        rejectionReason: d.rejectionReason,
        uploadedAt: d.uploadedAt,
        reviewedAt: d.reviewedAt,
        reviewedBy: d.reviewedBy,
        requestId: d.requestId,
        requestName: reqParent ? reqParent.name : 'Unknown Request',
        clientId: client ? client.id : '',
        clientName: client ? client.name : '',
        companyName: client ? client.companyName : '',
        requirementId: d.requirementId,
        requirementName: reqItem ? reqItem.name : 'Item',
      };
    });

  if (clientId) {
    docs = docs.filter(d => d.clientId === clientId);
  }

  if (requestId) {
    docs = docs.filter(d => d.requestId === requestId);
  }

  if (status && status !== 'All') {
    docs = docs.filter(d => d.status === status);
  }

  if (search) {
    docs = docs.filter(d =>
      d.filename.toLowerCase().includes(search) ||
      d.companyName.toLowerCase().includes(search) ||
      d.requestName.toLowerCase().includes(search) ||
      d.requirementName.toLowerCase().includes(search)
    );
  }

  res.json(docs);
});

// Download / secure preview route
// AUTHORIZATION: Requesters must be EITHER:
// a) An authenticated accountant belonging to the document's firm, OR
// b) A client supplying a valid portalToken matching this document's request.
app.get('/api/documents/:id/download', async (req: Request, res: Response) => {
  const data = db.getData();
  const doc = data.documents.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  let isAuthorized = false;
  let actorName = 'Unknown';
  let actorType: 'accountant' | 'client' = 'accountant';

  // Check 1: Authenticated accountant belonging to the document's firm
  const authToken = AuthService.extractToken(req);
  if (authToken) {
    const authResult = AuthService.validateToken(authToken);
    if (authResult && authResult.firm.id === doc.firmId) {
      isAuthorized = true;
      actorName = authResult.user.name;
      actorType = 'accountant';
    }
  }

  // Check 2: Client with valid portal token matching this document's request
  if (!isAuthorized) {
    const portalToken = (req.query.portalToken as string) || (req.headers['x-portal-token'] as string);
    if (portalToken) {
      const clientIp = PortalSecurityService.extractClientIp(req);
      const verification = PortalSecurityService.verifyToken(portalToken, clientIp);
      if (verification.status === 'VALID' && verification.request && verification.request.id === doc.requestId) {
        const client = data.clients.find(c => c.id === verification.request!.clientId);
        isAuthorized = true;
        actorName = client ? client.companyName : 'Client';
        actorType = 'client';
      }
    }
  }

  if (!isAuthorized) {
    return res.status(403).json({
      error: 'Forbidden: Access denied. You must be authenticated as the firm accountant or hold the secure portal token for this document.',
      code: 'ACCESS_DENIED',
    });
  }

  try {
    const retrieved = await DocumentStorageService.retrieveDocumentBinary(doc);

    // Audit log: record document download (Requirement 12)
    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId: doc.firmId,
      requestId: doc.requestId,
      action: 'document_downloaded',
      description: `${actorName} downloaded "${doc.filename}"`,
      actorType,
      actorName,
      createdAt: new Date().toISOString(),
    });
    db.commit();

    res.setHeader('Content-Type', retrieved.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(retrieved.filename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.send(retrieved.buffer);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve document binary: ' + err.message });
  }
});

// Delete document endpoint (Accountant action, firm scoped)
app.delete('/api/documents/:id', requireAuth, async (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION: verify document belongs to firm
  const doc = data.documents.find(d => d.id === req.params.id && d.firmId === firmId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Delete from storage provider & metadata
  await DocumentStorageService.deleteDocument(doc);

  // If attached to a requirement, reset requirement
  const requirement = data.requirements.find(rq => rq.uploadedDocumentId === req.params.id);
  if (requirement) {
    requirement.status = 'Missing';
    requirement.uploadedDocumentId = undefined;
    requirement.updatedAt = new Date().toISOString();

    const request = data.requests.find(r => r.id === requirement.requestId);
    if (request && request.status === 'Completed') {
      request.status = 'Active';
      request.updatedAt = new Date().toISOString();
    }
  }

  // Audit log: record document deletion (Requirement 12)
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    requestId: doc.requestId,
    action: 'document_deleted',
    description: `${req.user!.name} deleted document "${doc.filename}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, message: 'Document deleted successfully.' });
});

// ----------------------------------------------------
// TEMPLATES (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/templates', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  // STRICT TENANT ISOLATION
  const templates = data.templates.filter(t => t.firmId === firmId);
  res.json(templates);
});

app.post('/api/templates', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const { name, description, category, requirements } = req.body;

  if (!name || !requirements || requirements.length === 0) {
    return res.status(400).json({ error: 'Template name and at least one requirement are required' });
  }

  const templateId = `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const formattedRequirements = requirements.map((r: any, idx: number) => ({
    id: `tr_${Date.now()}_${idx}`,
    templateId,
    name: r.name,
    description: r.description || '',
    required: r.required !== false,
  }));

  const newTemplate = {
    id: templateId,
    firmId,
    name,
    description: description || '',
    category: category || 'General',
    requirements: formattedRequirements,
    createdAt: new Date().toISOString(),
  };

  data.templates.push(newTemplate);
  db.commit();
  res.status(201).json(newTemplate);
});

app.put('/api/templates/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const tmpl = data.templates.find(t => t.id === req.params.id && t.firmId === firmId);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });

  const { name, description, category, requirements } = req.body;
  if (name !== undefined) tmpl.name = name;
  if (description !== undefined) tmpl.description = description;
  if (category !== undefined) tmpl.category = category;
  if (requirements !== undefined) {
    tmpl.requirements = requirements.map((r: any, idx: number) => ({
      id: r.id || `tr_${Date.now()}_${idx}`,
      templateId: tmpl.id,
      name: r.name,
      description: r.description || '',
      required: r.required !== false,
    }));
  }

  db.commit();
  res.json(tmpl);
});

app.post('/api/templates/:id/duplicate', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const tmpl = data.templates.find(t => t.id === req.params.id && t.firmId === firmId);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });

  const newId = `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const duplicate = {
    ...tmpl,
    id: newId,
    firmId,
    name: `${tmpl.name} (Copy)`,
    createdAt: new Date().toISOString(),
    requirements: tmpl.requirements.map((r, idx) => ({
      ...r,
      id: `tr_${Date.now()}_${idx}`,
      templateId: newId,
    })),
  };

  data.templates.push(duplicate);
  db.commit();
  res.status(201).json(duplicate);
});

// Admin-only template deletion
app.delete('/api/templates/:id', requireAuth, requireRole('admin'), (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const index = data.templates.findIndex(t => t.id === req.params.id && t.firmId === firmId);
  if (index === -1) return res.status(404).json({ error: 'Template not found' });

  data.templates.splice(index, 1);
  db.commit();
  res.json({ success: true });
});

// ----------------------------------------------------
// RECURRING SCHEDULES (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/recurring-schedules', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const schedules = data.recurringSchedules
    .filter(s => s.firmId === firmId)
    .map(s => {
      const client = data.clients.find(c => c.id === s.clientId && c.firmId === firmId);
      const template = data.templates.find(t => t.id === s.templateId && t.firmId === firmId);
      const periodHistory = RecurringService.getPeriodHistory(s);

      return {
        ...s,
        clientName: client ? client.name : 'Unknown',
        companyName: client ? client.companyName : 'Unknown Client',
        clientEmail: client ? client.email : '',
        templateName: template ? template.name : 'Custom Template',
        periodHistory,
      };
    });

  res.json(schedules);
});

app.get('/api/recurring-schedules/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const schedule = data.recurringSchedules.find(s => s.id === req.params.id && s.firmId === firmId);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

  const client = data.clients.find(c => c.id === schedule.clientId && c.firmId === firmId);
  const template = data.templates.find(t => t.id === schedule.templateId && t.firmId === firmId);
  const periodHistory = RecurringService.getPeriodHistory(schedule);

  res.json({
    ...schedule,
    clientName: client ? client.name : 'Unknown',
    companyName: client ? client.companyName : 'Unknown Client',
    clientEmail: client ? client.email : '',
    templateName: template ? template.name : 'Custom Template',
    periodHistory,
  });
});

app.post('/api/recurring-schedules', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const {
    clientId,
    templateId,
    name,
    description,
    frequency,
    nextOccurrence,
    dueDateRule,
    reminderFrequencyDays,
    maxReminders,
    generateFirstImmediately,
  } = req.body;

  if (!clientId || !templateId || !name || !frequency) {
    return res.status(400).json({ error: 'Client, template, schedule name, and frequency are required.' });
  }

  // Verify client belongs to firm
  const client = data.clients.find(c => c.id === clientId && c.firmId === firmId);
  if (!client) return res.status(404).json({ error: 'Client not found in your practice.' });

  // Verify template belongs to firm
  const template = data.templates.find(t => t.id === templateId && t.firmId === firmId);
  if (!template) return res.status(404).json({ error: 'Template not found in your practice.' });

  const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const initialNextOccurrence = nextOccurrence || new Date().toISOString().split('T')[0];

  const newSchedule: RecurringSchedule = {
    id: scheduleId,
    firmId,
    clientId,
    templateId,
    name,
    description: description || '',
    frequency,
    nextOccurrence: initialNextOccurrence,
    dueDateRule: dueDateRule || { type: 'days_after_start', daysOffset: 14 },
    reminderFrequencyDays: Number(reminderFrequencyDays) || 3,
    maxReminders: Number(maxReminders) || 5,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.recurringSchedules.unshift(newSchedule);

  // Log schedule creation in audit trail
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId,
    action: 'recurring_schedule_created',
    description: `${req.user!.name} created recurring ${frequency} schedule "${name}" for ${client.companyName}`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();

  let firstRequest = null;
  if (generateFirstImmediately) {
    const genResult = RecurringService.generateRequestForSchedule(newSchedule.id, firmId, {
      force: true,
      actorName: req.user!.name,
    });
    if (genResult.success) {
      firstRequest = genResult.request;
    }
  }

  const periodHistory = RecurringService.getPeriodHistory(newSchedule);

  res.status(201).json({
    ...newSchedule,
    clientName: client.name,
    companyName: client.companyName,
    templateName: template.name,
    periodHistory,
    firstRequest,
  });
});

app.put('/api/recurring-schedules/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const schedule = data.recurringSchedules.find(s => s.id === req.params.id && s.firmId === firmId);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

  const {
    name,
    description,
    frequency,
    templateId,
    dueDateRule,
    reminderFrequencyDays,
    maxReminders,
    nextOccurrence,
  } = req.body;

  if (name) schedule.name = name;
  if (description !== undefined) schedule.description = description;
  if (frequency) schedule.frequency = frequency;
  if (templateId) schedule.templateId = templateId;
  if (dueDateRule) schedule.dueDateRule = dueDateRule;
  if (reminderFrequencyDays) schedule.reminderFrequencyDays = Number(reminderFrequencyDays);
  if (maxReminders) schedule.maxReminders = Number(maxReminders);
  if (nextOccurrence) schedule.nextOccurrence = nextOccurrence;
  schedule.updatedAt = new Date().toISOString();

  // Audit log
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: schedule.clientId,
    action: 'recurring_schedule_updated',
    description: `${req.user!.name} updated recurring schedule "${schedule.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();

  const periodHistory = RecurringService.getPeriodHistory(schedule);
  res.json({ ...schedule, periodHistory });
});

app.post('/api/recurring-schedules/:id/pause', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const schedule = data.recurringSchedules.find(s => s.id === req.params.id && s.firmId === firmId);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

  schedule.status = 'Paused';
  schedule.updatedAt = new Date().toISOString();

  // Audit log
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: schedule.clientId,
    action: 'recurring_schedule_paused',
    description: `${req.user!.name} paused recurring schedule "${schedule.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, schedule });
});

app.post('/api/recurring-schedules/:id/resume', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const schedule = data.recurringSchedules.find(s => s.id === req.params.id && s.firmId === firmId);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

  schedule.status = 'Active';
  schedule.updatedAt = new Date().toISOString();

  // Audit log
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: schedule.clientId,
    action: 'recurring_schedule_resumed',
    description: `${req.user!.name} resumed recurring schedule "${schedule.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, schedule });
});

app.post('/api/recurring-schedules/:id/stop', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const schedule = data.recurringSchedules.find(s => s.id === req.params.id && s.firmId === firmId);
  if (!schedule) return res.status(404).json({ error: 'Recurring schedule not found' });

  schedule.status = 'Stopped';
  schedule.updatedAt = new Date().toISOString();

  // Audit log
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: schedule.clientId,
    action: 'recurring_schedule_stopped',
    description: `${req.user!.name} stopped recurring schedule "${schedule.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true, schedule });
});

app.post('/api/recurring-schedules/:id/generate-now', requireAuth, (req: Request, res: Response) => {
  const firmId = req.firm!.id;
  const result = RecurringService.generateRequestForSchedule(req.params.id, firmId, {
    force: true,
    actorName: req.user!.name,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.message, code: result.code });
  }

  res.json({ success: true, request: result.request, message: result.message });
});

app.delete('/api/recurring-schedules/:id', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  const index = data.recurringSchedules.findIndex(s => s.id === req.params.id && s.firmId === firmId);
  if (index === -1) return res.status(404).json({ error: 'Recurring schedule not found' });

  const deleted = data.recurringSchedules.splice(index, 1)[0];

  // Audit log
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId,
    clientId: deleted.clientId,
    action: 'recurring_schedule_deleted',
    description: `${req.user!.name} deleted recurring schedule "${deleted.name}"`,
    actorType: 'accountant',
    actorName: req.user!.name,
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({ success: true });
});

app.post('/api/recurring-schedules/run-due', requireAuth, (_req: Request, res: Response) => {
  const results = RecurringService.processDueSchedules();
  res.json({ success: true, ...results });
});

// ----------------------------------------------------
// REMINDERS & CHASER LOGS (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/reminders', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;

  // STRICT TENANT ISOLATION
  const activeRequests = data.requests.filter(r => r.firmId === firmId && (r.status === 'Active' || r.status === 'Overdue'));
  const queue = activeRequests
    .map(r => {
      const evaluation = ChasingEngine.evaluateRequest(r.id);
      if (evaluation?.isComplete) return null;

      const client = data.clients.find(c => c.id === r.clientId && c.firmId === firmId);
      const missingDocs = evaluation ? evaluation.missingRequiredDocs : [];

      const lastSent = r.lastReminderSentAt ? new Date(r.lastReminderSentAt) : new Date(r.createdAt);
      const nextDate = evaluation?.nextReminderDue || new Date(lastSent.getTime() + (r.reminderFrequencyDays * 24 * 60 * 60 * 1000)).toISOString();

      const daysOutstanding = Math.max(0, Math.floor((Date.now() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
      const isPastDue = new Date(r.dueDate).getTime() < Date.now();
      const daysOverdue = isPastDue ? Math.floor((Date.now() - new Date(r.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      const isDue = Boolean(evaluation?.shouldSendReminder);

      let status = 'Waiting';
      if (r.remindersPaused) {
        status = 'Paused';
      } else if (r.maxReminders > 0 && r.maxReminders < 999 && (r.reminderCount || 0) >= r.maxReminders) {
        status = 'Max Reached';
      } else if (isDue) {
        status = 'Due Now';
      } else if (isPastDue) {
        status = 'Overdue';
      }

      return {
        requestId: r.id,
        clientId: r.clientId,
        clientName: client ? client.name : 'Unknown',
        companyName: client ? client.companyName : 'Unknown',
        clientEmail: client ? client.email : '',
        requestName: r.name,
        period: r.period,
        dueDate: r.dueDate,
        daysOutstanding,
        daysOverdue,
        isPastDue,
        isDue,
        missingCount: missingDocs.length,
        missingDocNames: missingDocs.map(d => d.name),
        lastReminder: r.lastReminderSentAt || null,
        nextReminder: nextDate,
        reminderCount: r.reminderCount || 0,
        maxReminders: r.maxReminders,
        remindersPaused: r.remindersPaused,
        status,
      };
    })
    .filter(Boolean);

  const firmReminders = data.reminders.filter(rem => rem.firmId === firmId);

  res.json({
    queue,
    history: firmReminders,
    providerName: notificationService.getProviderName(),
  });
});

// Run automated batch document chasing engine
app.post(['/api/reminders/send-all-due', '/api/chasing/run'], requireAuth, async (req: Request, res: Response) => {
  const firmId = req.firm!.id;
  const result = await ChasingEngine.runBatch(firmId);
  res.json({
    success: true,
    ...result,
  });
});

// Bulk send reminders to selected requests with strict personalization & idempotency
app.post('/api/reminders/bulk-send', requireAuth, async (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  const { requestIds, respectFrequency = true } = req.body || {};

  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return res.status(400).json({ error: 'Array of request IDs is required', code: 'INVALID_REQUEST_IDS' });
  }

  // STRICT TENANT ISOLATION: filter strictly to authenticated firm's requests
  const validRequests = data.requests.filter(r => requestIds.includes(r.id) && r.firmId === firmId);

  let processedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  const results: Array<{
    requestId: string;
    sent: boolean;
    reason: string;
    clientName?: string;
    companyName?: string;
    missingDocuments?: string[];
  }> = [];

  for (const request of validRequests) {
    processedCount++;
    const client = data.clients.find(c => c.id === request.clientId && c.firmId === firmId);

    // Respect completed requests
    if (request.status === 'Completed') {
      skippedCount++;
      results.push({
        requestId: request.id,
        sent: false,
        reason: 'ALL_REQUIRED_DOCUMENTS_APPROVED',
        clientName: client?.name,
        companyName: client?.companyName,
        missingDocuments: [],
      });
      continue;
    }

    // Respect paused requests
    if (request.remindersPaused) {
      skippedCount++;
      results.push({
        requestId: request.id,
        sent: false,
        reason: 'REMINDERS_PAUSED',
        clientName: client?.name,
        companyName: client?.companyName,
        missingDocuments: [],
      });
      continue;
    }

    // Respect maximum reminders limit
    if (request.maxReminders > 0 && request.maxReminders < 999 && (request.reminderCount || 0) >= request.maxReminders) {
      skippedCount++;
      results.push({
        requestId: request.id,
        sent: false,
        reason: 'MAX_REMINDERS_REACHED',
        clientName: client?.name,
        companyName: client?.companyName,
        missingDocuments: [],
      });
      continue;
    }

    // Respect reminder frequency if respectFrequency is true
    if (respectFrequency) {
      const evaluation = ChasingEngine.evaluateRequest(request.id);
      if (!evaluation?.shouldSendReminder) {
        skippedCount++;
        results.push({
          requestId: request.id,
          sent: false,
          reason: evaluation?.reason || 'REMINDER_NOT_YET_DUE',
          clientName: client?.name,
          companyName: client?.companyName,
          missingDocuments: evaluation ? evaluation.missingRequiredDocs.map(d => d.name) : [],
        });
        continue;
      }
    }

    // Dispatch individual reminder using ChasingEngine
    // Note: ChasingEngine builds the reminder individually based ONLY on that client's actual missing required documents!
    const sendResult = await ChasingEngine.sendReminder(request.id, {
      force: !respectFrequency,
      triggerType: 'manual',
      actorName: req.user!.name,
    });

    if (sendResult.sent) {
      sentCount++;
    } else {
      skippedCount++;
    }

    results.push({
      requestId: request.id,
      sent: sendResult.sent,
      reason: sendResult.reason,
      clientName: client?.name,
      companyName: client?.companyName,
      missingDocuments: sendResult.missingDocuments,
    });
  }

  res.json({
    success: true,
    processedCount,
    sentCount,
    skippedCount,
    results,
  });
});

// ----------------------------------------------------
// ACTIVITY LOGS (Strictly Scoped to req.firm.id)
// ----------------------------------------------------
app.get('/api/activity', requireAuth, (req: Request, res: Response) => {
  const data = db.getData();
  const firmId = req.firm!.id;
  // STRICT TENANT ISOLATION
  const firmActivities = data.activityLogs.filter(a => a.firmId === firmId).slice(0, 30);
  res.json(firmActivities);
});

// ----------------------------------------------------
// CLIENT PORTAL (Token-protected public endpoints)
// Clients have access ONLY to their own tokenized request
// ----------------------------------------------------
app.get('/api/portal/:token', (req: Request, res: Response) => {
  const clientIp = PortalSecurityService.extractClientIp(req);
  const verification = PortalSecurityService.verifyToken(req.params.token, clientIp);

  if (verification.status === 'RATE_LIMITED') {
    if (verification.retryAfterSeconds) {
      res.setHeader('Retry-After', verification.retryAfterSeconds.toString());
    }
    return res.status(429).json({
      error: 'Too many failed portal attempts. Access temporarily blocked for 15 minutes.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: verification.retryAfterSeconds,
    });
  }

  if (verification.status === 'REVOKED') {
    return res.status(403).json({
      error: 'This document portal link has been revoked by your accounting practice. Please contact your accountant for an updated link.',
      code: 'PORTAL_LINK_REVOKED',
    });
  }

  if (verification.status === 'EXPIRED') {
    return res.status(410).json({
      error: 'This document portal link has expired. Please contact your accounting practice for a new link.',
      code: 'PORTAL_LINK_EXPIRED',
    });
  }

  if (verification.status === 'INVALID' || !verification.request) {
    return res.status(404).json({
      error: 'Invalid document portal link. Please check your link or contact your accountant.',
      code: 'PORTAL_LINK_INVALID',
    });
  }

  const request = verification.request;
  const data = db.getData();
  const firm = data.firms.find(f => f.id === request.firmId);
  const client = data.clients.find(c => c.id === request.clientId && c.firmId === request.firmId);

  // Record portal access in practice audit log
  PortalSecurityService.logPortalAccess(request, clientIp);

  const requirements = data.requirements
    .filter(rq => rq.requestId === request.id)
    .map(rq => {
      const doc = rq.uploadedDocumentId ? data.documents.find(d => d.id === rq.uploadedDocumentId) : undefined;
      return {
        id: rq.id,
        name: rq.name,
        description: rq.description,
        required: rq.required,
        status: rq.status,
        rejectionReason: rq.rejectionReason,
        clientNote: rq.clientNote,
        document: doc ? {
          id: doc.id,
          filename: doc.filename,
          originalName: doc.originalName,
          sizeBytes: doc.sizeBytes,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
        } : null,
      };
    });

  const stats = calculateRequestStats(request.id);

  // Never expose internal client IDs, firm IDs, staff assignments, or accountant private notes
  res.json({
    request: {
      id: request.id,
      name: request.name,
      description: request.description,
      period: request.period,
      dueDate: request.dueDate,
      status: request.status,
      expiresAt: request.portalTokenExpiresAt,
      revoked: request.portalTokenRevoked,
    },
    firm: {
      name: firm ? firm.name : 'Accounting Practice',
      logoUrl: firm?.logoUrl,
    },
    client: {
      name: client ? client.name : '',
      companyName: client ? client.companyName : '',
    },
    requirements,
    stats,
  });
});

// Client uploads file
app.post('/api/portal/:token/upload', async (req: Request, res: Response) => {
  const clientIp = PortalSecurityService.extractClientIp(req);
  const verification = PortalSecurityService.verifyToken(req.params.token, clientIp);

  if (verification.status === 'RATE_LIMITED') {
    if (verification.retryAfterSeconds) {
      res.setHeader('Retry-After', verification.retryAfterSeconds.toString());
    }
    return res.status(429).json({
      error: 'Too many failed portal attempts. Access temporarily blocked.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: verification.retryAfterSeconds,
    });
  }

  if (verification.status === 'REVOKED') {
    return res.status(403).json({ error: 'This document portal link has been revoked.', code: 'PORTAL_LINK_REVOKED' });
  }

  if (verification.status === 'EXPIRED') {
    return res.status(410).json({ error: 'This document portal link has expired.', code: 'PORTAL_LINK_EXPIRED' });
  }

  if (verification.status === 'INVALID' || !verification.request) {
    return res.status(404).json({ error: 'Invalid document portal link.', code: 'PORTAL_LINK_INVALID' });
  }

  const request = verification.request;
  const data = db.getData();

  const { requirementId, filename, mimeType, fileDataUri } = req.body;
  if (!requirementId || !filename || !fileDataUri) {
    return res.status(400).json({ error: 'Requirement ID, filename, and file payload are required.' });
  }

  // CRITICAL: Ensure requirement belongs to THIS token's request! Prevents cross-request tampering
  const requirement = data.requirements.find(rq => rq.id === requirementId && rq.requestId === request.id);
  if (!requirement) {
    return res.status(404).json({ error: 'Requirement item not found for this request.' });
  }

  // Parse buffer from base64
  let fileBuffer: Buffer;
  try {
    if (typeof fileDataUri === 'string' && fileDataUri.startsWith('data:')) {
      const commaIdx = fileDataUri.indexOf(',');
      fileBuffer = Buffer.from(fileDataUri.substring(commaIdx + 1), 'base64');
    } else if (typeof fileDataUri === 'string') {
      fileBuffer = Buffer.from(fileDataUri, 'base64');
    } else {
      return res.status(400).json({ error: 'Invalid file payload format.' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid file encoding payload.' });
  }

  try {
    // Store via DocumentStorageService: enforces size, whitelist, magic bytes, safe internal key, separate metadata
    const newDoc = await DocumentStorageService.storeDocument({
      firmId: request.firmId,
      requestId: request.id,
      requirementId,
      filename,
      buffer: fileBuffer,
      declaredMimeType: mimeType,
    });

    requirement.status = 'Uploaded';
    requirement.uploadedDocumentId = newDoc.id;
    requirement.rejectionReason = undefined;
    requirement.updatedAt = new Date().toISOString();

    request.updatedAt = new Date().toISOString();

    const stats = calculateRequestStats(request.id);
    if (stats.requiredMissingCount === 0 && stats.missingCount === 0) {
      request.status = 'Completed';
    }

    const client = data.clients.find(c => c.id === request.clientId);
    // Record important client action in practice audit trail
    data.activityLogs.unshift({
      id: `act_${Date.now()}`,
      firmId: request.firmId,
      requestId: request.id,
      clientId: request.clientId,
      action: 'document_uploaded',
      description: `${client ? client.companyName : 'Client'} uploaded "${newDoc.filename}" for ${requirement.name}`,
      actorType: 'client',
      actorName: client ? client.companyName : 'Client',
      createdAt: new Date().toISOString(),
    });

    // Check request state
    ChasingEngine.handleDocumentStateChanged(request.id);

    db.commit();
    res.json({ success: true, documentId: newDoc.id, requirementStatus: requirement.status, stats });
  } catch (err: any) {
    if (err instanceof StorageValidationError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Failed to process document upload: ' + err.message });
  }
});

// Client marks item as Not Applicable
app.post('/api/portal/:token/mark-na', (req: Request, res: Response) => {
  const clientIp = PortalSecurityService.extractClientIp(req);
  const verification = PortalSecurityService.verifyToken(req.params.token, clientIp);

  if (verification.status === 'RATE_LIMITED') {
    if (verification.retryAfterSeconds) {
      res.setHeader('Retry-After', verification.retryAfterSeconds.toString());
    }
    return res.status(429).json({
      error: 'Too many failed portal attempts. Access temporarily blocked.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: verification.retryAfterSeconds,
    });
  }

  if (verification.status === 'REVOKED') {
    return res.status(403).json({ error: 'This document portal link has been revoked.', code: 'PORTAL_LINK_REVOKED' });
  }

  if (verification.status === 'EXPIRED') {
    return res.status(410).json({ error: 'This document portal link has expired.', code: 'PORTAL_LINK_EXPIRED' });
  }

  if (verification.status === 'INVALID' || !verification.request) {
    return res.status(404).json({ error: 'Invalid document portal link.', code: 'PORTAL_LINK_INVALID' });
  }

  const request = verification.request;
  const data = db.getData();

  const { requirementId, reason } = req.body;
  // CRITICAL: Ensure requirement belongs to THIS token's request! Prevents cross-request tampering
  const requirement = data.requirements.find(rq => rq.id === requirementId && rq.requestId === request.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement item not found for this request.' });

  requirement.status = 'Not applicable';
  requirement.clientNote = reason || 'Marked not applicable by client';
  requirement.updatedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();

  const client = data.clients.find(c => c.id === request.clientId);
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId: request.firmId,
    requestId: request.id,
    clientId: request.clientId,
    action: 'item_marked_na',
    description: `${client ? client.companyName : 'Client'} marked "${requirement.name}" as Not Applicable: "${reason || 'No explanation provided'}"`,
    actorType: 'client',
    actorName: client ? client.companyName : 'Client',
    createdAt: new Date().toISOString(),
  });

  ChasingEngine.handleDocumentStateChanged(request.id);
  const stats = calculateRequestStats(request.id);

  db.commit();
  res.json({
    success: true,
    requirement: {
      id: requirement.id,
      name: requirement.name,
      status: requirement.status,
      clientNote: requirement.clientNote,
    },
    stats,
  });
});

// Client adds note or question
app.post('/api/portal/:token/note', (req: Request, res: Response) => {
  const clientIp = PortalSecurityService.extractClientIp(req);
  const verification = PortalSecurityService.verifyToken(req.params.token, clientIp);

  if (verification.status === 'RATE_LIMITED') {
    if (verification.retryAfterSeconds) {
      res.setHeader('Retry-After', verification.retryAfterSeconds.toString());
    }
    return res.status(429).json({
      error: 'Too many failed portal attempts. Access temporarily blocked.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: verification.retryAfterSeconds,
    });
  }

  if (verification.status === 'REVOKED') {
    return res.status(403).json({ error: 'This document portal link has been revoked.', code: 'PORTAL_LINK_REVOKED' });
  }

  if (verification.status === 'EXPIRED') {
    return res.status(410).json({ error: 'This document portal link has expired.', code: 'PORTAL_LINK_EXPIRED' });
  }

  if (verification.status === 'INVALID' || !verification.request) {
    return res.status(404).json({ error: 'Invalid document portal link.', code: 'PORTAL_LINK_INVALID' });
  }

  const request = verification.request;
  const data = db.getData();

  const { requirementId, note } = req.body;
  // CRITICAL: Ensure requirement belongs to THIS token's request! Prevents cross-request tampering
  const requirement = data.requirements.find(rq => rq.id === requirementId && rq.requestId === request.id);
  if (!requirement) return res.status(404).json({ error: 'Requirement item not found for this request.' });

  requirement.clientNote = note;
  requirement.updatedAt = new Date().toISOString();

  const client = data.clients.find(c => c.id === request.clientId);
  data.activityLogs.unshift({
    id: `act_${Date.now()}`,
    firmId: request.firmId,
    requestId: request.id,
    clientId: request.clientId,
    action: 'client_note',
    description: `Note from ${client ? client.companyName : 'Client'} on "${requirement.name}": "${note}"`,
    actorType: 'client',
    actorName: client ? client.companyName : 'Client',
    createdAt: new Date().toISOString(),
  });

  db.commit();
  res.json({
    success: true,
    requirement: {
      id: requirement.id,
      name: requirement.name,
      status: requirement.status,
      clientNote: requirement.clientNote,
    },
  });
});

// Testing helper: Reset rate limits (dev/test only)
app.post('/api/testing/reset-rate-limit', (_req: Request, res: Response) => {
  PortalSecurityService.resetRateLimitsForTesting();
  res.json({ success: true, message: 'Portal security rate limits cleared.' });
});

// ----------------------------------------------------
// AI SERVICE ROUTES (Protected by requireAuth)
// ----------------------------------------------------
app.post('/api/ai/suggest-requirements', requireAuth, async (req: Request, res: Response) => {
  const { requestName, period, existingItems } = req.body;
  const suggestions = await aiService.suggestRequirements({
    requestName: requestName || 'General Bookkeeping',
    period,
    existingItems: existingItems || [],
  });
  res.json(suggestions);
});

app.post('/api/ai/draft-reminder', requireAuth, async (req: Request, res: Response) => {
  const { clientName, requestName, missingDocs, tone } = req.body;
  const draft = await aiService.draftReminder({
    clientName: clientName || 'Client',
    requestName: requestName || 'Document Request',
    missingDocs: missingDocs || [],
    tone: tone || 'firm',
  });
  res.json(draft);
});

// ----------------------------------------------------
// FRONTEND STATIC / DEV SERVER INTEGRATION
// ----------------------------------------------------
// Cloud Run Health Checks (Liveness and Startup probes)
app.get(['/health', '/api/health'], async (_req: Request, res: Response) => {
  try {
    const dbHealth = await dbService.checkHealth().catch(() => ({ healthy: false, engine: 'unreachable' }));
    const storageProvider = DocumentStorageService.getProvider().providerName;
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        engine: dbHealth.engine,
        healthy: dbHealth.healthy,
      },
      storage: {
        provider: storageProvider,
      },
    });
  } catch (err: any) {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      warning: err.message,
    });
  }
});

// Explicitly block direct HTTP requests attempting to access internal storage directories
app.all(['/data', '/data/*', '/server', '/server/*', '/private_storage', '/private_storage/*'], (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Direct access to server storage directories is forbidden.', code: 'ACCESS_BLOCKED' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`DocumentChaser Server running at http://0.0.0.0:${PORT}`);
    console.log(`Strict Multi-Tenant Isolation & Role RBAC Active.`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown handling for Google Cloud Run (SIGTERM / SIGINT)
  const shutdown = (signal: string) => {
    console.log(`\n[Cloud Run] Received ${signal}. Initiating graceful shutdown...`);
    server.close((err) => {
      if (err) {
        console.error('[Cloud Run] Error closing HTTP server:', err);
        process.exit(1);
      }
      console.log('[Cloud Run] HTTP server successfully closed.');
      process.exit(0);
    });

    // Force exit after 10-second timeout if hanging connections exist
    setTimeout(() => {
      console.error('[Cloud Run] Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
