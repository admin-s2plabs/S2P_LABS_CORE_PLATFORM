/**
 * Centralized application error codes and factory helper.
 *
 * Format returned to clients:
 *   { error: "Human-readable message", code: "AUTH_001" }
 *
 * Code groups:
 *   AUTH  – authentication & login
 *   OTP   – one-time-password flow
 *   ACC   – access control (guards, RBAC)
 *   USR   – user / profile / role management
 *   REG   – vendor registration
 *   INV   – invitation links
 *   PWD   – password reset / forgot-password
 *   ADMIN – administration / org settings
 *   PROC  – procurement (PRs, POs, receipts, categories)
 *   BID   – bids & bid events
 *   BUD   – budgets
 *   CON   – contracts
 *   VND   – vendor management (not registration)
 *   INVC  – invoices
 *   RPT   – reports
 *   FTRL  – free-trial / tenant registration
 *   AI    – AI console
 *   INTG  – integrations / inbound gateway
 *   AUC   – auctions
 *   SYS   – unexpected server errors
 */

export const ErrorCodes = {
  // ── Authentication ──────────────────────────────────────────────────────────
  AUTH_DOMAIN_NOT_FOUND:            "AUTH_001",
  AUTH_CREDENTIAL_PROCESSING:       "AUTH_002",
  AUTH_INVALID_CREDENTIALS:         "AUTH_003",
  AUTH_ACCOUNT_INACTIVE:            "AUTH_004",
  AUTH_ACCOUNT_LOCKED:              "AUTH_005",

  // ── OTP ─────────────────────────────────────────────────────────────────────
  OTP_ACCOUNT_NOT_FOUND:            "OTP_001",
  OTP_NOT_REQUESTED:                "OTP_002",
  OTP_EXPIRED:                      "OTP_003",
  OTP_INVALID:                      "OTP_004",
  OTP_SEND_FAILED:                  "OTP_005",

  // ── Access control ──────────────────────────────────────────────────────────
  ACC_NOT_AUTHENTICATED:            "ACC_001",
  ACC_STAFF_REQUIRED:               "ACC_002",
  ACC_VENDOR_REQUIRED:              "ACC_003",
  ACC_PERMISSION_DENIED:            "ACC_004",
  ACC_ROLE_REQUIRED:                "ACC_005",
  ACC_TENANT_REQUIRED:              "ACC_006",
  ACC_CROSS_TENANT_DENIED:          "ACC_007",

  // ── User / Profile / Role management ────────────────────────────────────────
  USR_NOT_FOUND:                    "USR_001",
  USR_UNAUTHORIZED:                 "USR_002",
  USR_PASSWORD_WEAK:                "USR_003",
  USR_WRONG_PASSWORD:               "USR_004",
  USR_USERNAME_EXISTS:              "USR_005",
  USR_MOBILE_EXISTS:                "USR_006",
  USR_EMAIL_EXISTS:                 "USR_007",
  USR_SUPPLIER_EXISTS:              "USR_008",
  USR_ROLE_NOT_FOUND:               "USR_009",
  USR_DELEGATION_NOT_FOUND:         "USR_010",
  USR_APPROVER_NOT_FOUND:           "USR_011",

  // ── Vendor registration ──────────────────────────────────────────────────────
  REG_MISSING_FIELDS:               "REG_001",
  REG_PASSWORD_WEAK:                "REG_002",
  REG_INVITATION_CANCELLED:         "REG_003",
  REG_INVITATION_EXPIRED:           "REG_004",

  // ── Invitation ──────────────────────────────────────────────────────────────
  INV_INVALID_LINK:                 "INV_001",
  INV_NOT_FOUND:                    "INV_002",
  INV_ALREADY_USED:                 "INV_003",
  INV_CANCELLED:                    "INV_004",
  INV_EXPIRED:                      "INV_005",

  // ── Password reset ──────────────────────────────────────────────────────────
  PWD_RESET_LINK_INVALID:           "PWD_001",
  PWD_RESET_LINK_EXPIRED:           "PWD_002",
  PWD_FORGOT_USER_NOT_FOUND:        "PWD_003",
  PWD_EMAIL_RECENTLY_SENT:          "PWD_004",
  PWD_CHANGE_WEAK:                  "PWD_005",
  PWD_CHANGE_WRONG_CURRENT:         "PWD_006",

  // ── Administration ──────────────────────────────────────────────────────────
  ADMIN_ORG_NOT_FOUND:              "ADMIN_001",
  ADMIN_NO_FILE:                    "ADMIN_002",
  ADMIN_NOTIF_TEMPLATE_NOT_FOUND:   "ADMIN_003",
  ADMIN_WORKFLOW_NOT_FOUND:         "ADMIN_004",
  ADMIN_TASK_NOT_FOUND:             "ADMIN_005",
  ADMIN_FEATURE_NOT_FOUND:          "ADMIN_006",
  ADMIN_PROVIDER_NOT_FOUND:         "ADMIN_007",
  ADMIN_AUDIT_REQUIRED:             "ADMIN_008",
  ADMIN_INVALID_BOOLEAN:            "ADMIN_009",
  ADMIN_SUBSIDIARY_NOT_FOUND:       "ADMIN_010",

  // ── Procurement ─────────────────────────────────────────────────────────────
  PROC_REQUIRED_FIELDS:             "PROC_001",
  PROC_REQUISITION_NOT_FOUND:       "PROC_002",
  PROC_CATEGORY_NOT_FOUND:          "PROC_003",
  PROC_ITEM_NOT_FOUND:              "PROC_004",
  PROC_NO_FILE:                     "PROC_005",
  PROC_NO_DELIVERY_NOTES:           "PROC_006",
  PROC_PO_ACCESS_DENIED:            "PROC_007",
  PROC_INVALID_PARENT_CATEGORY:     "PROC_008",

  // ── Bids ────────────────────────────────────────────────────────────────────
  BID_NOT_FOUND:                    "BID_001",
  BID_SUPPLIER_REQUIRED:            "BID_002",
  BID_NOT_INVITED:                  "BID_003",
  BID_FILE_NOT_FOUND:               "BID_004",
  BID_INVALID_ID:                   "BID_005",
  BID_MISSING_FIELDS:               "BID_006",
  BID_INVALID_DOC_TYPE:             "BID_007",
  BID_ENVELOPE_NOT_OPENED:          "BID_008",
  BID_CANCEL_REASON_REQUIRED:       "BID_009",
  BID_DATE_REQUIRED:                "BID_010",
  BID_DATE_PAST:                    "BID_011",
  BID_EVAL_REQUIRED:                "BID_012",
  BID_AWARD_INVALID:                "BID_013",
  BID_AWARD_REQUIRED:               "BID_014",
  BID_TEMPLATE_NAME_REQUIRED:       "BID_015",
  BID_BROADCAST_REQUIRED:           "BID_016",
  BID_APPROVERS_REQUIRED:           "BID_017",
  BID_SCORE_REQUIRED:               "BID_018",
  BID_COMMENTS_REQUIRED:            "BID_019",

  // ── Budgets ─────────────────────────────────────────────────────────────────
  BUD_NOT_FOUND:                    "BUD_001",
  BUD_NO_FILE:                      "BUD_002",

  // ── Contracts ───────────────────────────────────────────────────────────────
  CON_NOT_FOUND:                    "CON_001",
  CON_SECTION_NOT_FOUND:            "CON_002",
  CON_TERM_NOT_FOUND:               "CON_003",
  CON_TEMPLATE_NOT_FOUND:           "CON_004",
  CON_MISSING_FIELDS:               "CON_005",
  CON_INVALID_STATUS:               "CON_006",
  CON_SUPPLIER_REQUIRED:            "CON_007",
  CON_OWNER_REQUIRED:               "CON_008",
  CON_NO_CLAUSES:                   "CON_009",
  CON_TEMPLATE_HAS_SECTIONS:        "CON_010",
  CON_NOT_REVIEWER:                 "CON_011",
  CON_INVALID_PARTY:                "CON_012",
  CON_AI_NOT_CONFIGURED:            "CON_013",
  CON_WORKFLOW_ERROR:               "CON_014",
  CON_NO_REVIEW_TEAM:               "CON_015",
  CON_INVALID_APPROVAL_ACTION:      "CON_016",
  CON_NO_APPROVER_HIERARCHY:        "CON_017",

  // ── Vendor management (not registration) ────────────────────────────────────
  VND_INVITATION_INVALID:           "VND_001",
  VND_SUPPLIER_NOT_FOUND:           "VND_002",
  VND_SUPPLIER_INVALID_ID:          "VND_003",
  VND_EMAIL_REQUIRED:               "VND_004",
  VND_STATUS_REQUIRED:              "VND_005",

  // ── Invoices ────────────────────────────────────────────────────────────────
  INVC_NO_FILE:                     "INVC_001",
  INVC_INVALID_FILE:                "INVC_002",
  INVC_MISSING_FIELDS:              "INVC_003",

  // ── Reports ─────────────────────────────────────────────────────────────────
  RPT_INVALID_ID:                   "RPT_001",
  RPT_NOT_FOUND:                    "RPT_002",
  RPT_TEMPLATE_NOT_FOUND:           "RPT_003",
  RPT_MISSING_FIELDS:               "RPT_004",

  // ── Free trial / Tenant registration ────────────────────────────────────────
  FTRL_DOMAIN_REQUIRED:             "FTRL_001",
  FTRL_DOMAIN_INVALID:              "FTRL_002",
  FTRL_DOMAIN_FORMAT:               "FTRL_003",
  FTRL_DOMAIN_TAKEN:                "FTRL_004",
  FTRL_EMAIL_TAKEN:                 "FTRL_005",
  FTRL_MISSING_FIELDS:              "FTRL_006",

  // ── AI console ──────────────────────────────────────────────────────────────
  AI_NOT_CONFIGURED:                "AI_001",
  AI_MISSING_FIELDS:                "AI_002",
  AI_VENDOR_NOT_FOUND:              "AI_003",
  AI_NO_FILE:                       "AI_004",
  AI_DOC_TYPE_REQUIRED:             "AI_005",
  AI_EXTRACTED_DATA_REQUIRED:       "AI_006",

  // ── Integrations / Inbound gateway ──────────────────────────────────────────
  INTG_AUTH_REQUIRED:               "INTG_001",
  INTG_API_KEY_INVALID:             "INTG_002",
  INTG_VALIDATION_FAILED:           "INTG_003",
  INTG_DUPLICATE:                   "INTG_004",

  // ── Auctions ────────────────────────────────────────────────────────────────
  AUC_OPERATION_FAILED:             "AUC_001",

  // ── System ──────────────────────────────────────────────────────────────────
  SYS_LOGIN_FAILED:                 "SYS_001",
  SYS_OTP_SEND_FAILED:              "SYS_002",
  SYS_OTP_VERIFY_FAILED:            "SYS_003",
  SYS_INTERNAL:                     "SYS_099",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Creates a typed error body `{ error, code }` ready to pass to `res.json()`. */
export function appError(message: string, code: ErrorCode) {
  return { error: message, code } as const;
}
