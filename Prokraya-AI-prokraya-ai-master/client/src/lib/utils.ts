import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Returns the tenant subdomain (e.g. "acme" from "acme.prokraya.ai"), or null on the main domain / localhost
export function getTenantSubdomain(): string | null {
  const hostname = window.location.hostname;
  if (
    hostname === "prokraya.ai" ||
    hostname === "www.prokraya.ai" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "prokraya" ||
    hostname === "prokrayaai" ||
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".replit.app")
  ) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length > 2 && parts[0] !== "www") {
    return parts[0];
  }
  // Support tenant.localhost, tenant.prokraya
  if (parts.length === 2 && (parts[1] === "localhost" || parts[1] === "local" || parts[1] === "prokraya" || parts[1] === "prokrayaai")) {
    return parts[0];
  }
  return null;
}
