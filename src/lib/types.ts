export type FileStatus = "Pending" | "Clean" | "Suspicious" | "Corrupted" | "Repaired";

export interface ScanFile {
  id: string;
  name: string;
  type: string;
  size: string;
  hash: string;
  status: FileStatus;
  evidence: string;
  date: string;
  user: string;
  expiresAt?: string;
  isExpired?: boolean;
}

export interface ActionLog {
  id: string;
  date: string;
  file: string;
  fileType?: string;
  fileSize?: string;
  fileStatus?: FileStatus | null;
  action: string;
  user: string;
  notes: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  joined: string;
}
