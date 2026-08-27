import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

const _originalFetch = window.fetch.bind(window);
const REFRESH_ENDPOINT = "/api/auth/token";
let refreshTokenPromise: Promise<boolean> | null = null;

function getStoredAuth(): Record<string, any> | null {
  try {
    return JSON.parse(localStorage.getItem("prokraya-auth") || "null");
  } catch {
    return null;
  }
}

function getRefreshToken(): string | undefined {
  const auth = getStoredAuth();
  return auth?.refresh_token ?? auth?.refreshToken;
}

function updateStoredAuthTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
}) {
  const existing = getStoredAuth() || {};
  const normalizedAccessToken = tokens.access_token.toLowerCase().startsWith("bearer ")
    ? tokens.access_token
    : `Bearer ${tokens.access_token}`;

  const updated = {
    ...existing,
    access_token: normalizedAccessToken,
    token_type: tokens.token_type ?? "Bearer",
  } as Record<string, any>;

  if (tokens.refresh_token) {
    updated.refresh_token = tokens.refresh_token;
  }

  localStorage.setItem("prokraya-auth", JSON.stringify(updated));
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  try {
    const res = await _originalFetch(new Request(REFRESH_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    }));

    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    if (!data.access_token) {
      return false;
    }

    updateStoredAuthTokens(data);
    return true;
  } catch {
    return false;
  }
}

async function ensureRefreshToken(): Promise<boolean> {
  if (!refreshTokenPromise) {
    refreshTokenPromise = refreshAccessToken();
    try {
      return await refreshTokenPromise;
    } finally {
      refreshTokenPromise = null;
    }
  }
  return refreshTokenPromise;
}

window.fetch = async function patchedFetch(input, init = {}) {
  const originalRequest = input instanceof Request ? input : new Request(input, init);
  const url = originalRequest.url;
  const skipRefresh = url.includes(REFRESH_ENDPOINT) || url.includes("/api/auth/login") || url.includes("/api/auth/logout");

  const headers = new Headers(originalRequest.headers);
  const authData = getStoredAuth();

  if (authData) {
    const token: string | undefined = authData.access_token ?? authData.accessToken;
    if (token && !headers.has("authorization")) {
      const authValue = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
      headers.set("Authorization", authValue);
    }
    if (authData.userId && !headers.has("x-user-email")) {
      headers.set("x-user-email", authData.userId);
    }
    if (authData.userName && !headers.has("x-user-name")) {
      headers.set("x-user-name", authData.userName);
    }
  }

  const request = new Request(originalRequest, {
    headers,
    credentials: originalRequest.credentials || "include",
  });

  let res = await _originalFetch(request);

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await ensureRefreshToken();
    if (refreshed) {
      // Update headers with new token and retry the original request
      const newAuthData = getStoredAuth();
      if (newAuthData?.access_token) {
        const newHeaders = new Headers(request.headers);
        const newToken = newAuthData.access_token.toLowerCase().startsWith("bearer ")
          ? newAuthData.access_token
          : `Bearer ${newAuthData.access_token}`;
        newHeaders.set("Authorization", newToken);

        const retryRequest = new Request(request, { headers: newHeaders });
        res = await _originalFetch(retryRequest);
      }
    }
  }

  return res;
};

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);