import cron from 'node-cron';
import { pool } from '../db';
import { getContextPool } from '../tenant-context';
import { emailService } from './emailService';
import { propertiesService } from './propertiesService';
import { eventBus } from './eventBus';
import { EventTypes } from './eventBus/events';
import * as adminRepo from "../modules/administration/administration.repository";

const getPool = () => getContextPool() ?? pool;

// ─────────────────────────────────────────────────────────────────────────────
// Prokraya Scheduled Events
//
// This file is the Node.js equivalent of ScheduledEvents.java from the classic
// application. It runs background jobs on a cron schedule.
//
// HOW TO ADD A NEW EVENT:
//   1. Write a private async function below (e.g. `notifyContractExpiry`)
//   2. Call it inside the appropriate batch function (hourlyBatch / dailyBatch /
//      weeklyBatch) or create a new cron.schedule() block at the bottom.
//   3. Restart the server — that's it.
//
// FUTURE: When the AI Workbench Workflow Builder is live, these hardcoded jobs
// will be replaced by user-configured workflow templates and this file retired.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(date: Date): number {
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((date.getTime() - now.getTime()) / msPerDay);
}

async function sendDirectEmail(
  to: string,
  subject: string,
  html: string,
  isSupplierRecipient = false
): Promise<void> {
  if (!to) return;
  try {
    await emailService.sendEmail({ to, subject, html, isSupplierRecipient });
  } catch (err) {
    console.error('[Scheduler] Failed to send email to', to, err);
  }
}

// ── 1. AUTO-CLOSE BIDS (every 15 minutes) ────────────────────────────────────
// Closes any bid whose closing date has passed and status is still Published or Negotiation.

async function autoCloseBids(): Promise<void> {
  try {
    const result = await getPool().query(`
      SELECT h.id, h.bid_title, h.enddate
      FROM dbo.supp_bid_dtls h
      WHERE h.status in ('Published', 'Negotiation')
        AND h.enddate < NOW()
    `);

    for (const bid of result.rows) {
      try {
        await getPool().query(`
          UPDATE dbo.supp_bid_dtls
          SET status = 'Closed', last_updated_date = NOW()
          WHERE id = $1
        `, [bid.id]);

        console.log(`[Scheduler] Auto-closed bid: ${bid.id} (${bid.bid_title})`);

        // ── Notify bid committee members ────────────────────────────────────
        const members = await getPool().query(`
          SELECT u.email_id, u.name
          FROM dbo.supp_bid_approver_dtls t
          JOIN dbo.um_user_dtls u ON u.user_name = t.user_name
          WHERE t.bid_id = $1
        `, [bid.id]);

        for (const m of members.rows) {
          await sendDirectEmail(
            m.email_id,
            `Bid Closed: ${bid.id} – ${bid.bid_title}`,
            `<p>Dear ${m.name},</p>
             <p>The bid <strong>${bid.id} – ${bid.bid_title}</strong> has been automatically closed as its closing date has passed.</p>
             <p>Please log in to S2P Labs to proceed with bid evaluation.</p>`
          );
        }
      } catch (err) {
        console.error(`[Scheduler] Error closing bid ${bid.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] autoCloseBids error:', err);
  }
}

// ── 2. VENDOR DOCUMENT EXPIRY (daily at 9 AM) ────────────────────────────────
// Notifies vendor contacts when their documents expire in 60/45/30/15/≤5 days.

async function notifyVendorDocumentExpiry(): Promise<void> {
  try {
    const result = await getPool().query(`
      SELECT d.id, d.doc_type, d.expiry_date, d.doc_no,
             v.id AS vendor_id, v.company_name,
             v.email_id AS vendor_email,
             v.contact_person
      FROM dbo.supp_document_dtls d
      JOIN dbo.supp_basic_org_dtls v ON v.id = d.vendor_id
      WHERE d.expiry_date IS NOT NULL
        AND v.status = 'Active'
        AND d.expiry_date > NOW()
    `);

    const notifyAtDays = [60, 45, 30, 15, 5, 4, 3, 2, 1];

    for (const doc of result.rows) {
      try {
        const daysLeft = daysBetween(new Date(doc.expiry_date));
        if (!notifyAtDays.includes(daysLeft)) continue;

        const urgency = daysLeft <= 5 ? '⚠️ URGENT – ' : '';
        const subject = `${urgency}Document Expiry Reminder: ${doc.doc_type} – ${doc.company_name}`;
        const html = `
          <p>Dear ${doc.contact_person || doc.company_name},</p>
          <p>This is a reminder that your <strong>${doc.doc_type}</strong>
          ${doc.doc_no ? `(Ref: ${doc.doc_no})` : ''} is expiring in
          <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>
          (${new Date(doc.expiry_date).toLocaleDateString()}).</p>
          <p>Please log in to the Vendor Portal and upload a renewed document before the expiry date to avoid disruption.</p>
        `;

        await sendDirectEmail(doc.vendor_email, subject, html, true);
        console.log(`[Scheduler] Notified ${doc.company_name} – ${doc.doc_type} expires in ${daysLeft} days`);

        // Also notify procurement team members managing this vendor
        const buyers = await getPool().query(`
          SELECT DISTINCT u.email_id, u.name
          FROM dbo.supp_po_header_dtls po
          JOIN dbo.um_user_dtls u ON u.user_name = po.created_by
          WHERE po.vendor_id = $1
            AND po.status NOT IN ('Cancelled', 'Closed')
          LIMIT 10
        `, [doc.vendor_id]);

        for (const buyer of buyers.rows) {
          await sendDirectEmail(
            buyer.email_id,
            `${urgency}Vendor Document Expiry: ${doc.company_name} – ${doc.doc_type}`,
            `<p>Dear ${buyer.name},</p>
             <p>Vendor <strong>${doc.company_name}</strong>'s <strong>${doc.doc_type}</strong>
             is expiring in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
             <p>Please follow up with the vendor to ensure their documents are renewed.</p>`
          );
        }
      } catch (err) {
        console.error(`[Scheduler] Error processing doc expiry for vendor ${doc.company_name}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] notifyVendorDocumentExpiry error:', err);
  }
}

// ── 3. CONTRACT EXPIRY NOTIFICATIONS (daily at 9 AM) ─────────────────────────
// Notifies contract owners when active contracts expire in 90/60/30/15/7 days.

async function notifyContractExpiry(): Promise<void> {
  try {
    const result = await getPool().query(`
      SELECT h.id, h.ref_no, h.title, h.end_date, h.is_renewable,
             h.contract_owner,
             v.company_name AS vendor_name,
             u.email_id AS owner_email, u.name AS owner_name
      FROM dbo.cm_header h
      LEFT JOIN dbo.supp_basic_org_dtls v ON v.id = h.vendor_id
      LEFT JOIN dbo.um_user_dtls u ON u.user_name = h.contract_owner
      WHERE h.status = 'Active'
        AND h.end_date IS NOT NULL
        AND h.end_date > NOW()
    `);

    const notifyAtDays = [90, 60, 30, 15, 7];

    for (const contract of result.rows) {
      try {
        const daysLeft = daysBetween(new Date(contract.end_date));
        if (!notifyAtDays.includes(daysLeft)) continue;

        const isRenewable = contract.is_renewable === 'Yes';
        const action = isRenewable ? 'renew or renegotiate' : 'terminate or replace';
        const subject = `Contract Expiry Alert: ${contract.ref_no} – ${contract.title} (${daysLeft} days remaining)`;
        const html = `
          <p>Dear ${contract.owner_name || contract.contract_owner},</p>
          <p>The contract <strong>${contract.ref_no} – ${contract.title}</strong>
          with vendor <strong>${contract.vendor_name || 'N/A'}</strong> is expiring in
          <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>
          (${new Date(contract.end_date).toLocaleDateString()}).</p>
          <p>This contract is <strong>${isRenewable ? 'eligible for renewal' : 'not marked for renewal'}</strong>.
          Please log in to S2P Labs to ${action} this contract.</p>
        `;

        if (contract.owner_email) {
          await sendDirectEmail(contract.owner_email, subject, html);
          console.log(`[Scheduler] Contract expiry alert sent: ${contract.ref_no} (${daysLeft} days)`);
        }
      } catch (err) {
        console.error(`[Scheduler] Error processing contract expiry ${contract.ref_no}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] notifyContractExpiry error:', err);
  }
}

// ── 4. BUDGET AUTO-EXPIRE (daily at 1:15 AM) ─────────────────────────────────
// Marks approved budgets as Expired when their end date has passed.

async function expireOverdueBudgets(): Promise<void> {
  try {
    const result = await getPool().query(`
      UPDATE dbo.am_budget_mst
      SET status = 'Expired'
      WHERE status = 'Approved'
        AND end_date < CURRENT_DATE
      RETURNING id, budget_name, budget_owner_name
    `);

    for (const budget of result.rows) {
      console.log(`[Scheduler] Budget expired: ${budget.budget_name} (owner: ${budget.budget_owner_name})`);
    }

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[Scheduler] ${result.rowCount} budget(s) marked as Expired`);
    }
  } catch (err) {
    console.error('[Scheduler] expireOverdueBudgets error:', err);
  }
}

// ── 5. PENDING APPROVAL TASK REMINDERS (daily at 1:15 AM) ────────────────────
// Sends a daily email to users who have pending approval tasks in their inbox.

async function sendPendingTaskReminders(): Promise<void> {
  try {
    const result = await getPool().query(`
      SELECT
        t.task_id, t.subject, t.ref_no, t.task_type,
        t.potential_owner, t.inbox_date,
        u.email_id, u.name AS user_name
      FROM dbo.am_workflow_tasks t
      LEFT JOIN dbo.um_user_dtls u ON u.user_name = t.potential_owner
      WHERE t.status = 'Ready'
        AND t.inbox_date < NOW() - INTERVAL '24 hours'
      ORDER BY t.potential_owner, t.inbox_date
    `);

    // Group tasks by user so each user gets one consolidated email
    const tasksByUser = new Map<string, { email: string; name: string; tasks: any[] }>();

    for (const row of result.rows) {
      const key = row.potential_owner;
      if (!tasksByUser.has(key)) {
        tasksByUser.set(key, { email: row.email_id, name: row.user_name, tasks: [] });
      }
      tasksByUser.get(key)!.tasks.push(row);
    }

    for (const [owner, data] of tasksByUser) {
      if (!data.email) continue;
      try {
        const taskRows = data.tasks
          .map(t => `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee">${t.ref_no || '–'}</td>
            <td style="padding:8px;border-bottom:1px solid #eee">${t.subject || '–'}</td>
            <td style="padding:8px;border-bottom:1px solid #eee">${t.task_type || '–'}</td>
            <td style="padding:8px;border-bottom:1px solid #eee">${new Date(t.inbox_date).toLocaleDateString()}</td>
          </tr>`)
          .join('');

        const html = `
          <p>Dear ${data.name || owner},</p>
          <p>You have <strong>${data.tasks.length} pending approval task${data.tasks.length !== 1 ? 's' : ''}</strong>
          awaiting your action in S2P Labs:</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px;text-align:left">Ref #</th>
                <th style="padding:8px;text-align:left">Subject</th>
                <th style="padding:8px;text-align:left">Type</th>
                <th style="padding:8px;text-align:left">Received</th>
              </tr>
            </thead>
            <tbody>${taskRows}</tbody>
          </table>
          <p style="margin-top:16px">Please log in to S2P Labs to action these tasks.</p>
        `;

        await sendDirectEmail(
          data.email,
          `Reminder: You have ${data.tasks.length} pending approval task${data.tasks.length !== 1 ? 's' : ''} in S2P Labs`,
          html
        );
        console.log(`[Scheduler] Task reminder sent to ${owner} (${data.tasks.length} tasks)`);
      } catch (err) {
        console.error(`[Scheduler] Error sending task reminder to ${owner}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] sendPendingTaskReminders error:', err);
  }
}

// ── 6. BUSINESS REGISTRATION DOC EXPIRY (weekly – Mondays 1:30 AM) ───────────
// Notifies the procurement team about vendors with expired business registration.

async function notifyExpiredBusinessRegDocs(): Promise<void> {
  try {
    const result = await getPool().query(`
      SELECT d.id, d.doc_type, d.expiry_date, d.doc_no,
             v.id AS vendor_id, v.company_name, v.email_id AS vendor_email,
             v.contact_person
      FROM dbo.supp_document_dtls d
      JOIN dbo.supp_basic_org_dtls v ON v.id = d.vendor_id
      WHERE d.doc_type ILIKE '%business registration%'
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date < NOW()
        AND v.status = 'Active'
    `);

    for (const doc of result.rows) {
      try {
        const daysPast = Math.abs(daysBetween(new Date(doc.expiry_date)));
        const subject = `Expired Business Registration: ${doc.company_name}`;
        const html = `
          <p>Dear Procurement Team,</p>
          <p>The <strong>Business Registration Document</strong> for vendor
          <strong>${doc.company_name}</strong>
          ${doc.doc_no ? `(Doc Ref: ${doc.doc_no})` : ''}
          expired <strong>${daysPast} day${daysPast !== 1 ? 's' : ''} ago</strong>
          (${new Date(doc.expiry_date).toLocaleDateString()}).</p>
          <p>Please contact the vendor and request they upload a renewed document,
          or consider suspending the vendor from the active list.</p>
        `;

        // Notify procurement managers
        const procManagers = await getPool().query(`
          SELECT DISTINCT u.email_id, u.name
          FROM dbo.um_user_dtls u
          JOIN dbo.um_user_roles_map_dtls r ON r.user_id = u.id
          JOIN dbo.um_role_mst rm ON rm.id = r.role_id
          WHERE rm.role_name IN ('ROLE_PROCUREMENT_MANAGER', 'ROLE_SUPERADMIN')
            AND u.user_status = 1
          LIMIT 5
        `);

        for (const mgr of procManagers.rows) {
          await sendDirectEmail(mgr.email_id, subject, html);
        }

        console.log(`[Scheduler] Business reg expiry notified: ${doc.company_name} (${daysPast} days past)`);
      } catch (err) {
        console.error(`[Scheduler] Error processing biz reg doc for ${doc.company_name}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] notifyExpiredBusinessRegDocs error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function dailyBatch(): Promise<void> {
  console.log('[Scheduler] ── Daily batch starting ──');
  await expireOverdueBudgets();
  await sendPendingTaskReminders();
  // ↓ Add new daily events here
  console.log('[Scheduler] ── Daily batch complete ──');
}

async function morningBatch(): Promise<void> {
  console.log('[Scheduler] ── Morning batch starting ──');
  await notifyVendorDocumentExpiry();
  await notifyContractExpiry();
  // ↓ Add new morning events here
  console.log('[Scheduler] ── Morning batch complete ──');
}

async function weeklyBatch(): Promise<void> {
  console.log('[Scheduler] ── Weekly batch starting ──');
  await notifyExpiredBusinessRegDocs();
  // ↓ Add new weekly events here
  console.log('[Scheduler] ── Weekly batch complete ──');
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER ALL SCHEDULED JOBS
// Called once from server/index.ts at startup.
// ─────────────────────────────────────────────────────────────────────────────

async function isSchedulerEnabled(): Promise<boolean> {
  const val = await propertiesService.get('SCHEDULER_ENABLED', 'true');
  return val !== 'false';
}

export function registerScheduledEvents(): void {
  console.log('[Scheduler] Registering scheduled events...');

  // Every 15 minutes — auto-close bids whose closing date has passed
  cron.schedule('0,15,30,45 * * * *', async () => {
    if (!await isSchedulerEnabled()) { console.log('[Scheduler] Skipped autoCloseBids — scheduler disabled.'); return; }
    autoCloseBids().catch(err => console.error('[Scheduler] autoCloseBids uncaught:', err));
  });

  // Daily at 1:15 AM — budget expiry + pending task reminders
  cron.schedule('15 1 * * *', async () => {
    if (!await isSchedulerEnabled()) { console.log('[Scheduler] Skipped dailyBatch — scheduler disabled.'); return; }
    dailyBatch().catch(err => console.error('[Scheduler] dailyBatch uncaught:', err));
  });

  // Daily at 9:00 AM — vendor document expiry + contract expiry alerts
  cron.schedule('0 9 * * *', async () => {
    if (!await isSchedulerEnabled()) { console.log('[Scheduler] Skipped morningBatch — scheduler disabled.'); return; }
    morningBatch().catch(err => console.error('[Scheduler] morningBatch uncaught:', err));
  });

  // Every Monday at 1:30 AM — expired business registration docs
  cron.schedule('30 1 * * 1', async () => {
    if (!await isSchedulerEnabled()) { console.log('[Scheduler] Skipped weeklyBatch — scheduler disabled.'); return; }
    weeklyBatch().catch(err => console.error('[Scheduler] weeklyBatch uncaught:', err));
  });

  // Every 5 minutes — auction ending soon / closed notifications
  cron.schedule('*/5 * * * *', async () => {
    if (!await isSchedulerEnabled()) return;
    processAuctionNotifications().catch(err => console.error('[Scheduler] processAuctionNotifications uncaught:', err));
  });

  console.log('[Scheduler] All scheduled events registered.');
  console.log('[Scheduler] Jobs active: auto-close bids (15min), auction alerts (5min), daily batch (01:15), morning alerts (09:00), weekly (Mon 01:30)');
}

async function processAuctionNotifications(): Promise<void> {
  try {
    const frontendUrl = process.env.FRONTEND_URL || '';
    const orgData = await adminRepo.getOrgDetails();

    // 1. AUCTION_ENDING_SOON (ends in 15 minutes)
    const endingSoon = await getPool().query(`
      SELECT e.id, e.name, e.end_time, m.supp_id, s.company_name, s.email_id
      FROM dbo.au_auction_event e
      JOIN dbo.au_auction_event_supp_mapping m ON m.eventid = e.id
      JOIN dbo.supp_basic_org_dtls s ON s.id = m.supp_id
      WHERE e.status = 'Active'
        AND e.end_time > NOW()
        AND e.end_time <= NOW() + INTERVAL '15 minutes'
        AND (e.attribute14 IS NULL OR e.attribute14 != 'EndingSoonSent')
    `);

    for (const row of endingSoon.rows) {
      eventBus.publish({
        eventType: EventTypes.AUCTION_ENDING_SOON,
        timestamp: new Date(),
        vendorName: row.company_name || "Vendor",
        auctionId: String(row.id),
        endTime: String(row.end_time),
        linkUrl: `${frontendUrl}/auctions/${row.id}`,
        receiverEmail: row.email_id || "",
        orgLogoPath: orgData.org_logo_path,
      });
    }
    
    if (endingSoon.rows.length > 0) {
      const ids = Array.from(new Set(endingSoon.rows.map(r => r.id)));
      await getPool().query(`
        UPDATE dbo.au_auction_event
        SET attribute14 = 'EndingSoonSent'
        WHERE id = ANY($1)
      `, [ids]);
    }

    // 2. AUCTION_CLOSED
    const closed = await getPool().query(`
      SELECT e.id, e.name, m.supp_id, s.company_name, s.email_id
      FROM dbo.au_auction_event e
      JOIN dbo.au_auction_event_supp_mapping m ON m.eventid = e.id
      JOIN dbo.supp_basic_org_dtls s ON s.id = m.supp_id
      WHERE e.status IN ('Pending Awarded', 'Closed', 'Awarded')
        AND (e.attribute13 IS NULL OR e.attribute13 != 'ClosedSent')
    `);

    for (const row of closed.rows) {
      eventBus.publish({
        eventType: EventTypes.AUCTION_CLOSED,
        timestamp: new Date(),
        vendorName: row.company_name || "Vendor",
        auctionId: String(row.id),
        receiverEmail: row.email_id || "",
        orgLogoPath: orgData.org_logo_path,
      });
    }

    if (closed.rows.length > 0) {
      const ids = Array.from(new Set(closed.rows.map(r => r.id)));
      await getPool().query(`
        UPDATE dbo.au_auction_event
        SET attribute13 = 'ClosedSent'
        WHERE id = ANY($1)
      `, [ids]);
    }
  } catch (err) {
    console.error('[Scheduler] processAuctionNotifications error:', err);
  }
}
