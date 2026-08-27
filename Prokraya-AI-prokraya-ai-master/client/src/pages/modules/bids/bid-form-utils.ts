import type { BidFormData } from "./bid-form-sheet";

export function getCurrentLocalDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function addHoursToLocalDateTime(value: string, hours: number): string {
  const d = new Date(value);
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toLocalISOString(dtLocal: string): string {
  if (!dtLocal) return dtLocal;
  const d = new Date(dtLocal);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${dtLocal}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function formatDateTimeInput(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const raw = String(dateString);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function clampDateTimeLocal(value: string): string {
  if (!value) return value;
  const selectedDate = new Date(value);
  const currentDate = new Date();
  currentDate.setSeconds(0, 0);
  if (selectedDate < currentDate) {
    return getCurrentLocalDateTime();
  }
  return value;
}

export function validateBidHeaderForm(form: BidFormData): string | null {
  if (!form.org_id) return "Business Entity is required.";
  if (!form.buyer_id) return "Buyer is required.";
  if (!form.currency) return "Currency is required.";
  if (!form.startdate) return "Bid Open Date is required.";
  if (!form.enddate) return "Bid Close Date is required.";
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMilliseconds(0);
  const start = new Date(form.startdate);
  const end = new Date(form.enddate);
  start.setSeconds(0, 0);
  start.setMilliseconds(0);
  end.setSeconds(0, 0);
  end.setMilliseconds(0);
  if (start < now) return "Bid open date cannot be in the past.";
  if (end < now) return "Bid close date cannot be in the past.";
  if (start > end) return "Bid Open Date cannot be after Bid Close Date.";
  if (form.type === "Tender" && !form.env_open_date) {
    return "Envelope Open Date is required for Tender bids.";
  }
  return null;
}

export function validateNegotiationDates(openDate?: string, closeDate?: string): string | null {
  if (!openDate) return "Open date is required.";
  if (!closeDate) return "Close date is required.";
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMilliseconds(0);
  const start = new Date(openDate);
  const end = new Date(closeDate);
  start.setSeconds(0, 0);
  start.setMilliseconds(0);
  end.setSeconds(0, 0);
  end.setMilliseconds(0);
  if (start < now) return "Open date cannot be in the past.";
  if (end <= start) return "Close date must be after the open date.";
  return null;
}

export function validateBidPreviewDates(openDate?: string, closeDate?: string): string | null {
  if (!openDate) return "Bid open date is required.";
  if (!closeDate) return "Bid close date is required.";
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMilliseconds(0);
  const start = new Date(openDate);
  const end = new Date(closeDate);
  start.setSeconds(0, 0);
  start.setMilliseconds(0);
  end.setSeconds(0, 0);
  end.setMilliseconds(0);
  if (start < now) return "Bid open date cannot be in the past.";
  if (end < now) return "Bid close date cannot be in the past.";
  if (start > end) return "Bid open date cannot be after bid close date.";
  return null;
}

/** Validate create-bid-from-PR preview — only bid type and dates are user-editable. */
export function validatePrBidPreview(preview: {
  bidType: string;
  openDate?: string;
  closeDate?: string;
  envOpenDate?: string;
}): string | null {
  const dateError = validateBidPreviewDates(preview.openDate, preview.closeDate);
  if (dateError) return dateError;
  if (preview.bidType === "Tender" && !preview.envOpenDate) {
    return "Envelope Open Date is required for Tender bids.";
  }
  if (preview.bidType === "Tender" && preview.envOpenDate && preview.closeDate) {
    const envelope = new Date(preview.envOpenDate);
    const close = new Date(preview.closeDate);
    envelope.setSeconds(0, 0);
    envelope.setMilliseconds(0);
    close.setSeconds(0, 0);
    close.setMilliseconds(0);
    if (envelope < close) {
      return "Envelope open date cannot be before bid close date.";
    }
  }
  return null;
}
