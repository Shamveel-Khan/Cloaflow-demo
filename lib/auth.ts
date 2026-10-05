export const DEMO_USER = {
  email: process.env.DEMO_EMAIL || "demo@cloaflow.local",
  password: process.env.DEMO_PASSWORD || "demo123",
  name: "Demo Operator",
};

export const AUTH_COOKIE_NAME = "cloaflow_session";
export const LEGACY_AUTH_COOKIE_NAME = "aiva_token";

export function verifyCredentials(email?: string | null, password?: string | null): boolean {
  if (!email || !password) return false;

  const validEmail = (process.env.DEMO_EMAIL || "demo@cloaflow.local").toLowerCase();
  const validPassword = process.env.DEMO_PASSWORD || "demo123";
  const dashboardToken = process.env.DASHBOARD_TOKEN;

  const inputEmail = email.trim().toLowerCase();
  const inputPassword = password.trim();

  // Match demo email + password
  if (inputEmail === validEmail && inputPassword === validPassword) {
    return true;
  }

  // Match dashboard token
  if (dashboardToken && (inputPassword === dashboardToken || inputEmail === dashboardToken)) {
    return true;
  }

  return false;
}

export function isValidSession(tokenValue?: string | null): boolean {
  if (!tokenValue) return false;

  const validPassword = process.env.DEMO_PASSWORD || "demo123";
  const dashboardToken = process.env.DASHBOARD_TOKEN;

  if (
    tokenValue === "demo-session-token" ||
    tokenValue === "cloaflow-authenticated" ||
    tokenValue === validPassword ||
    (dashboardToken && tokenValue === dashboardToken)
  ) {
    return true;
  }

  // Base64 session string check
  try {
    const decoded = Buffer.from(tokenValue, "base64").toString("utf-8");
    if (decoded.startsWith("cloaflow:") || decoded.startsWith("demo@")) {
      return true;
    }
  } catch {
    // Ignore invalid base64
  }

  return false;
}

export function createSessionToken(email: string): string {
  return Buffer.from(`cloaflow:${email}:${Date.now()}`).toString("base64");
}
