import { toast } from "@/hooks/use-toast";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

// URL patterns whose 401s should NOT trigger a global logout.
// These endpoints may return 401 for resource-specific reasons
// (wrong ID, permission denied) rather than session expiry.
const SKIP_LOGOUT_URL_PATTERNS = [
  "/api/profile/",
  "/api/users/",
  "/api/suppliers/",
  "/api/workflow-engine/task/",
  "/api/auth/invitation",
  "/api/countries",
  "/api/org-details"
];

function shouldSkipLogout(url: string): boolean {
  return SKIP_LOGOUT_URL_PATTERNS.some((p) => url.includes(p));
}

async function throwIfResNotOk(res: Response, skipLogout = false) {
  let isUnauthorizedHandling = false;
  if (res.status === 401) {
    if (!isUnauthorizedHandling) {
      isUnauthorizedHandling = true;
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.sessionStorage.removeItem("auth-failure-handled");
        localStorage.removeItem("prokraya-auth");
        window.location.href = "/login";
      }, 3000);
      return;
    }
    // Clone before reading body (body can only be consumed once).
    const clonedRes = res.clone();
    let isBusinessError = false;
    try {
      const data = await clonedRes.json();
      // "Not authenticated" is the session-expired signal from requireAuth — treat as session expiry.
      // Any other error/message is a real business-level 401 (e.g. account disabled).
      if ((data.error || data.message) && data.error !== "Not authenticated") {
        isBusinessError = true;
      }
    } catch {
      // Not JSON or empty body — treat as session expiry
    }

    // Skip logout if the caller opted out OR if the URL is a resource-specific endpoint.
    const noLogout = skipLogout || shouldSkipLogout(res.url ?? "");

    if (!isBusinessError && !noLogout) {
      if (!window.sessionStorage.getItem("auth-failure-handled")) {
        window.sessionStorage.setItem("auth-failure-handled", "true");

        toast({
          title: "Session Expired",
          description: "Your session has expired. Please log in again.",
          variant: "destructive",
        });

        localStorage.removeItem("prokraya-auth");

        // Delay redirect slightly so the user can see the toast
        setTimeout(() => {
          window.sessionStorage.removeItem("auth-failure-handled");
          window.location.href = "/login";
        }, 1500);
      }
      throw new Error("Session expired. Please log in again.");
    }

    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try { message = JSON.parse(text)?.error || JSON.parse(text)?.message || text; } catch { }
    throw new Error(message);
  }
}

function getAuthHeaders(): Record<string, string> {
  const authData = localStorage.getItem("prokraya-auth");
  if (authData) {
    try {
      const parsed = JSON.parse(authData);
      const headers: Record<string, string> = {
        "x-user-email": parsed.userId || "",
        "x-user-name": parsed.userName || "",
      };
      // access_token is stored as "Bearer <jwt>" (token_type + access_token concatenated at login).
      // Support both field names for compatibility.
      const token: string | undefined = parsed.access_token ?? parsed.accessToken;
      if (token) {
        headers["Authorization"] = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
      }
      return headers;
    } catch {
      return {};
    }
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { skipLogout?: boolean },
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };

  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const isFormData = data instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: isFormData
    ? getAuthHeaders()
    : {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
    body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, options?.skipLogout ?? false);
  return res;
}

/**
 * Drop-in replacement for fetch() that pipes 401 responses through the same
 * auth-error handling as apiRequest, without triggering a global logout.
 * Use this for resource-specific GET calls that may legitimately return 401.
 */
export async function fetchSafe(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers as Record<string, string> ?? {}) },
  });
  await throwIfResNotOk(res, true);
  return res;
}

/** Use after apiRequest when the body must be JSON (avoids opaque errors if HTML was returned). */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    const isHtml =
      /^\s*</.test(text) &&
      (text.includes("<!DOCTYPE") || text.includes("<html"));
    throw new Error(
      isHtml
        ? "Server returned HTML instead of JSON. The API route may be missing or the request hit the app shell."
        : text.slice(0, 200) || "Unexpected non-JSON response",
    );
  }
  return res.json() as Promise<T>;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  skipLogout?: boolean;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, skipLogout = false }) =>
    async ({ queryKey }) => {
      const url = queryKey.join("/") as string;
      const res = await fetch(url, {
        credentials: "include",
        headers: getAuthHeaders(),
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res, skipLogout);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
