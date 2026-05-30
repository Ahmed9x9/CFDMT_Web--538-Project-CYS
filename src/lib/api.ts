import type { ActionLog, AppUser, FileStatus, ScanFile } from "@/lib/types";

export interface AppMetrics {
  totalUploaded: number;
  totalScans: number;
  corrupted: number;
  repaired: number;
  failedRepair: number;
  needsRepair: number;
  recentActions: number;
  totalUsers: number;
}

export interface ApiScanFile extends ScanFile {
  fullHash?: string;
  scanPayload?: unknown;
  repairDetails?: unknown;
  repairedDownloadUrl?: string | null;
  status: FileStatus;
}

export interface ApiState {
  files: ApiScanFile[];
  actions: ActionLog[];
  metrics: AppMetrics;
  currentUser: AppUser;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: "admin" | "user";
  isActive: boolean;
  joined: string;
}

export interface AdminPolicy {
  allowedExtensions: string[];
  maxUploadSizeMb: number;
  autoScanOnUpload: boolean;
  fileAccessWindowSeconds: number;
  fileAccessWindowLabel: string;
}

export interface UserSettings {
  theme: "system" | "light" | "dark";
  defaultScanProfile: "quick" | "full" | "custom";
  emailNotifications: boolean;
  defaultUploadAction: "upload_only" | "upload_and_scan";
  showExpiredFiles: boolean;
  preferredFileView: "compact" | "detailed";
  hideClearedHistory: boolean;
}

export interface SettingsState {
  settings: UserSettings;
  security: {
    accountStatus: string;
    joinedDate: string;
    lastLoginDate: string | null;
    recentFailedLoginCount: number;
  };
  policy: AdminPolicy;
  user: AppUser;
}

export interface AdminHealth {
  database: string;
  activeUsers: number;
  inactiveUsers: number;
  storedFiles: number;
  scanResults: number;
  openFailedJobs: number;
  archivedLogs: number;
  activeLogs: number;
}

export interface AdminSecurity {
  failedLoginAttempts: number;
  uploadRejections: number;
  suspiciousScans: number;
  corruptedScans: number;
  highRiskTypes: Array<{ type: string; count: number }>;
  events: Array<{ date: string; event: string; notes: string; ipAddress: string }>;
}

export interface AdminState extends ApiState {
  users: AdminUserRow[];
  policies: AdminPolicy;
  health: AdminHealth;
  security: AdminSecurity;
}

export const emptyMetrics: AppMetrics = {
  totalUploaded: 0,
  totalScans: 0,
  corrupted: 0,
  repaired: 0,
  failedRepair: 0,
  needsRepair: 0,
  recentActions: 0,
  totalUsers: 0,
};

export const emptyState: ApiState = {
  files: [],
  actions: [],
  metrics: emptyMetrics,
  currentUser: {
    id: "",
    name: "Signed in user",
    email: "",
    role: "user",
    joined: "",
  },
};

export const emptyAdminState: AdminState = {
  ...emptyState,
  users: [],
  policies: {
    allowedExtensions: [],
    maxUploadSizeMb: 50,
    autoScanOnUpload: false,
    fileAccessWindowSeconds: 86400,
    fileAccessWindowLabel: "24 hours",
  },
  health: {
    database: "",
    activeUsers: 0,
    inactiveUsers: 0,
    storedFiles: 0,
    scanResults: 0,
    openFailedJobs: 0,
    archivedLogs: 0,
    activeLogs: 0,
  },
  security: {
    failedLoginAttempts: 0,
    uploadRejections: 0,
    suspiciousScans: 0,
    corruptedScans: 0,
    highRiskTypes: [],
    events: [],
  },
};

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "X-CFDMT-Request": "fetch",
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export async function getState(): Promise<ApiState> {
  return request<ApiState>("/api/app/state.php");
}

export async function getAdminState(): Promise<AdminState> {
  return request<AdminState>("/api/admin/state.php");
}

export async function updateAdminUser(payload: {
  userId: string;
  role: "admin" | "user";
  isActive: boolean;
}): Promise<{ ok: boolean }> {
  return request("/api/admin/update_user.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminPolicy(payload: Omit<AdminPolicy, "fileAccessWindowLabel">): Promise<{ ok: boolean; policies: AdminPolicy }> {
  return request("/api/admin/policy.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function runAdminMaintenance(payload: {
  action: "archive_logs" | "clear_failed_jobs";
  days: number;
}): Promise<{ ok: boolean; message: string }> {
  return request("/api/admin/maintenance.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminAuditExportUrl(): string {
  return "/api/admin/export_audit.php";
}

export async function uploadFile(
  file: File,
  scan: boolean,
  profile = "full",
): Promise<{ file: ApiScanFile; state: ApiState }> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams({
    scan: scan ? "true" : "false",
    profile,
  });
  return request(`/api/files/upload.php?${params.toString()}`, {
    method: "POST",
    body: formData,
  });
}

export async function scanFile(fileId: string, profile = "full"): Promise<{ file: ApiScanFile; state: ApiState }> {
  return request("/api/scans/create.php", {
    method: "POST",
    body: JSON.stringify({ fileId, profile }),
  });
}

export async function repairFile(fileId: string): Promise<{
  file: ApiScanFile;
  repair: { success: boolean; message: string; details?: unknown };
  state: ApiState;
}> {
  return request("/api/repairs/repair.php", {
    method: "POST",
    body: JSON.stringify({ fileId }),
  });
}

export async function deleteFile(fileId: string): Promise<{ ok: boolean; state: ApiState }> {
  return request("/api/files/delete.php", {
    method: "POST",
    body: JSON.stringify({ fileId }),
  });
}

export async function clearHistory(payload: {
  mode: "entry" | "last24h" | "last7days" | "lastWeek" | "all";
  entryId?: string;
}): Promise<{ ok: boolean; cleared: { files: number; scans: number; repairs: number; actions: number }; state: ApiState }> {
  return request("/api/history/clear.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function downloadFileUrl(fileId: string): string {
  return `/api/files/download.php?id=${encodeURIComponent(fileId)}`;
}

export async function login(email: string, password: string): Promise<{ ok: boolean; user: AppUser }> {
  return request("/api/auth/login.php", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  return request("/api/auth/register.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<{ ok: boolean }> {
  return request("/api/auth/logout.php", { method: "POST" });
}

export async function getCurrentUser(): Promise<{ authenticated: boolean; user: AppUser | null }> {
  return request("/api/auth/me.php");
}

export async function getSettings(): Promise<SettingsState> {
  return request<SettingsState>("/api/settings/get.php");
}

export async function updateSettings(payload: {
  name: string;
  theme: UserSettings["theme"];
  defaultScanProfile: UserSettings["defaultScanProfile"];
  emailNotifications: boolean;
  defaultUploadAction: UserSettings["defaultUploadAction"];
  showExpiredFiles: boolean;
  preferredFileView: UserSettings["preferredFileView"];
  hideClearedHistory: boolean;
}): Promise<{ ok: boolean; user: AppUser }> {
  return request("/api/settings/update.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: boolean }> {
  return request("/api/settings/change_password.php", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function accountActivityExportUrl(): string {
  return "/api/settings/export_activity.php";
}
