import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Database,
  Download,
  FileUp,
  FileWarning,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  adminAuditExportUrl,
  type AdminUserRow,
  emptyAdminState,
  getAdminState,
  runAdminMaintenance,
  updateAdminPolicy,
  updateAdminUser,
} from "@/lib/api";

type PendingConfirm =
  | {
      confirmLabel: string;
      description: string;
      kind: "user";
      payload: { userId: string; role: "admin" | "user"; isActive: boolean };
      title: string;
      variant?: "default" | "destructive";
    }
  | {
      confirmLabel: string;
      description: string;
      kind: "maintenance";
      payload: { action: "archive_logs" | "clear_failed_jobs"; days: number };
      title: string;
      variant?: "default" | "destructive";
    };

export default function Admin() {
  const queryClient = useQueryClient();
  const [scanSearch, setScanSearch] = useState("");
  const [scanType, setScanType] = useState("all");
  const [scanStatus, setScanStatus] = useState("all");
  const [scanDate, setScanDate] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const [actionType, setActionType] = useState("all");
  const [actionName, setActionName] = useState("all");
  const [actionStatus, setActionStatus] = useState("all");
  const [actionDate, setActionDate] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRole, setUserRole] = useState("all");
  const [userStatus, setUserStatus] = useState("all");
  const [allowedExtensions, setAllowedExtensions] = useState("");
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState("50");
  const [fileAccessWindowSeconds, setFileAccessWindowSeconds] = useState("86400");
  const [autoScanOnUpload, setAutoScanOnUpload] = useState(false);
  const [maintenanceDays, setMaintenanceDays] = useState("30");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const { data = emptyAdminState } = useQuery({
    queryKey: ["admin-state"],
    queryFn: getAdminState,
  });
  const { actions, files, health, metrics, policies, security, users } = data;

  useEffect(() => {
    setAllowedExtensions(policies.allowedExtensions.join(", "));
    setMaxUploadSizeMb(String(policies.maxUploadSizeMb));
    setFileAccessWindowSeconds(String(policies.fileAccessWindowSeconds));
    setAutoScanOnUpload(policies.autoScanOnUpload);
  }, [policies]);

  const invalidateAdmin = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-state"] });
  };

  const userMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: async () => {
      setPendingConfirm(null);
      toast.success("User updated.");
      await invalidateAdmin();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update user."),
  });

  const policyMutation = useMutation({
    mutationFn: updateAdminPolicy,
    onSuccess: async () => {
      toast.success("File policy saved.");
      await invalidateAdmin();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save policy."),
  });

  const maintenanceMutation = useMutation({
    mutationFn: runAdminMaintenance,
    onSuccess: async ({ message }) => {
      setPendingConfirm(null);
      toast.success(message);
      await invalidateAdmin();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Maintenance action failed."),
  });

  const scanTypes = Array.from(new Set(files.map((f) => f.type))).sort();
  const scanStatuses = Array.from(new Set(files.map((f) => f.status))).sort();
  const actionTypes = Array.from(new Set(actions.map((a) => a.fileType).filter((t): t is string => Boolean(t && t !== "-")))).sort();
  const actionNames = Array.from(new Set(actions.map((a) => a.action))).sort();
  const actionStatuses = Array.from(new Set(actions.map((a) => a.fileStatus).filter(Boolean))).sort();
  const filteredScans = files.filter((file) => {
    const searchText = [file.type, file.status, file.date, file.evidence].join(" ").toLowerCase();
    return (
      searchText.includes(scanSearch.toLowerCase()) &&
      (scanType === "all" || file.type === scanType) &&
      (scanStatus === "all" || file.status === scanStatus) &&
      (!scanDate || file.date === scanDate)
    );
  });
  const filteredActions = actions.filter((action) => {
    const searchText = [
      action.date,
      action.fileType,
      action.fileSize,
      action.fileStatus,
      action.action,
      action.user,
      action.notes,
    ].join(" ").toLowerCase();
    return (
      searchText.includes(actionSearch.toLowerCase()) &&
      (actionType === "all" || action.fileType === actionType) &&
      (actionName === "all" || action.action === actionName) &&
      (actionStatus === "all" || action.fileStatus === actionStatus) &&
      (!actionDate || action.date === actionDate)
    );
  });
  const filteredUsers = users.filter((user) => {
    const searchText = [user.email, user.role, user.joined, user.isActive ? "active" : "inactive"].join(" ").toLowerCase();
    return (
      searchText.includes(userSearch.toLowerCase()) &&
      (userRole === "all" || user.role === userRole) &&
      (userStatus === "all" || (userStatus === "active" ? user.isActive : !user.isActive))
    );
  });

  const savePolicy = () => {
    policyMutation.mutate({
      allowedExtensions: allowedExtensions.split(/[,\s]+/).filter(Boolean),
      maxUploadSizeMb: Number(maxUploadSizeMb),
      fileAccessWindowSeconds: Number(fileAccessWindowSeconds),
      autoScanOnUpload,
    });
  };

  const days = Math.max(0, Number(maintenanceDays) || 0);
  const confirmationBusy = userMutation.isPending || maintenanceMutation.isPending;

  const requestRoleChange = (targetUser: AdminUserRow) => {
    const nextRole = targetUser.role === "admin" ? "user" : "admin";
    setPendingConfirm({
      confirmLabel: nextRole === "admin" ? "Make admin" : "Make user",
      description:
        nextRole === "admin"
          ? `This will give ${targetUser.email} access to admin pages and management actions.`
          : `This will remove admin access from ${targetUser.email}.`,
      kind: "user",
      payload: { userId: targetUser.id, role: nextRole, isActive: targetUser.isActive },
      title: nextRole === "admin" ? "Make this user an admin?" : "Remove this user's admin access?",
      variant: nextRole === "admin" ? "default" : "destructive",
    });
  };

  const requestStatusChange = (targetUser: AdminUserRow) => {
    const nextActive = !targetUser.isActive;
    setPendingConfirm({
      confirmLabel: nextActive ? "Activate user" : "Deactivate user",
      description: nextActive
        ? `${targetUser.email} will be able to sign in and use the website again.`
        : `${targetUser.email} will lose access to protected pages until reactivated.`,
      kind: "user",
      payload: { userId: targetUser.id, role: targetUser.role, isActive: nextActive },
      title: nextActive ? "Activate this user?" : "Deactivate this user?",
      variant: nextActive ? "default" : "destructive",
    });
  };

  const requestMaintenance = (action: "archive_logs" | "clear_failed_jobs") => {
    setPendingConfirm({
      confirmLabel: action === "archive_logs" ? "Archive logs" : "Clear failed jobs",
      description:
        action === "archive_logs"
          ? `This will hide active system action logs older than ${days} days from the System actions table. The log records stay in the database.`
          : `This will permanently delete failed repair job records older than ${days} days. Uploaded files and scan results will not be deleted.`,
      kind: "maintenance",
      payload: { action, days },
      title: action === "archive_logs" ? "Archive old logs?" : "Clear old failed repair jobs?",
      variant: action === "archive_logs" ? "default" : "destructive",
    });
  };

  const confirmPendingAction = () => {
    if (!pendingConfirm) {
      return;
    }
    if (pendingConfirm.kind === "user") {
      userMutation.mutate(pendingConfirm.payload);
      return;
    }
    maintenanceMutation.mutate(pendingConfirm.payload);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="System-wide oversight and management." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total users" value={metrics.totalUsers} icon={Users} />
        <MetricCard label="Uploaded files" value={metrics.totalUploaded} icon={FileUp} />
        <MetricCard label="Corrupted" value={metrics.corrupted} icon={FileWarning} />
        <MetricCard label="Successful repair" value={metrics.repaired} icon={Wrench} />
        <MetricCard label="Failed repair" value={metrics.failedRepair} icon={AlertTriangle} />
      </div>

      <Tabs defaultValue="scans">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="actions">System actions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="policies">File policies</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="scans">
          <Card><CardContent className="p-4">
            <div className="mb-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px_160px]">
              <SearchInput value={scanSearch} onChange={setScanSearch} placeholder="Search scans" />
              <FilterSelect value={scanType} onChange={setScanType} label="All types" values={scanTypes} />
              <FilterSelect value={scanStatus} onChange={setScanStatus} label="All statuses" values={scanStatuses} />
              <Input type="date" value={scanDate} onChange={(event) => setScanDate(event.target.value)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScans.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.type}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    <TableCell>{f.date}</TableCell>
                  </TableRow>
                ))}
                {filteredScans.length === 0 && <EmptyRow colSpan={3} text="No scans match the selected filters." />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card><CardContent className="p-4">
            <div className="mb-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_150px_170px_160px_160px]">
              <SearchInput value={actionSearch} onChange={setActionSearch} placeholder="Search actions" />
              <FilterSelect value={actionType} onChange={setActionType} label="All types" values={actionTypes} />
              <FilterSelect value={actionName} onChange={setActionName} label="All actions" values={actionNames} />
              <FilterSelect value={actionStatus} onChange={setActionStatus} label="All statuses" values={actionStatuses} />
              <Input type="date" value={actionDate} onChange={(event) => setActionDate(event.target.value)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.date}</TableCell>
                    <TableCell className="font-medium">{a.fileType ?? "-"}</TableCell>
                    <TableCell>{a.fileStatus ? <StatusBadge status={a.fileStatus} /> : "-"}</TableCell>
                    <TableCell>{a.action}</TableCell>
                    <TableCell>{a.user}</TableCell>
                    <TableCell className="text-muted-foreground">{a.notes || "-"}</TableCell>
                  </TableRow>
                ))}
                {filteredActions.length === 0 && <EmptyRow colSpan={6} text="No system actions match the selected filters." />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="users">
          <Card><CardContent className="p-4">
            <div className="mb-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px]">
              <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users" />
              <FilterSelect value={userRole} onChange={setUserRole} label="All roles" values={["admin", "user"]} />
              <FilterSelect value={userStatus} onChange={setUserStatus} label="All statuses" values={["active", "inactive"]} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const isSelf = user.id === data.currentUser.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                      <TableCell>{user.isActive ? "Active" : "Inactive"}</TableCell>
                      <TableCell>{user.joined}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSelf || userMutation.isPending}
                          onClick={() => requestRoleChange(user)}
                        >
                          {user.role === "admin" ? "Make user" : "Make admin"}
                        </Button>
                        <Button
                          size="sm"
                          variant={user.isActive ? "destructive" : "outline"}
                          disabled={isSelf || userMutation.isPending}
                          onClick={() => requestStatusChange(user)}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && <EmptyRow colSpan={5} text="No users match the selected filters." />}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card><CardContent className="grid gap-5 p-5 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="allowedExtensions">Allowed extensions</Label>
              <Input
                id="allowedExtensions"
                value={allowedExtensions}
                placeholder="png, jpg, jpeg, pdf, zip, rar, 7z"
                onChange={(event) => setAllowedExtensions(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Default supported types: PNG, JPG, PDF, ZIP, RAR, 7Z.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxUploadSize">Max upload size MB</Label>
              <Input
                id="maxUploadSize"
                type="number"
                min="1"
                max="200"
                value={maxUploadSizeMb}
                onChange={(event) => setMaxUploadSizeMb(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fileAccessWindow">File access time</Label>
              <Select value={fileAccessWindowSeconds} onValueChange={setFileAccessWindowSeconds}>
                <SelectTrigger id="fileAccessWindow">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="86400">24 hours</SelectItem>
                  <SelectItem value="259200">3 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={autoScanOnUpload} onCheckedChange={setAutoScanOnUpload} id="autoScan" />
              <Label htmlFor="autoScan">Automatic scan on upload</Label>
            </div>
            <div className="lg:col-span-4">
              <Button onClick={savePolicy} disabled={policyMutation.isPending}>
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Save policy
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="space-y-4 p-5">
              <div className="space-y-2">
                <Label htmlFor="maintenanceDays">Older than days</Label>
                <Input
                  id="maintenanceDays"
                  type="number"
                  min="0"
                  value={maintenanceDays}
                  onChange={(event) => setMaintenanceDays(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={maintenanceMutation.isPending}
                  onClick={() => requestMaintenance("archive_logs")}
                >
                  <Database className="mr-2 h-4 w-4" /> Archive logs
                </Button>
                <Button
                  variant="destructive"
                  disabled={maintenanceMutation.isPending}
                  onClick={() => requestMaintenance("clear_failed_jobs")}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Clear failed jobs
                </Button>
                <Button asChild>
                  <a
                    href={adminAuditExportUrl()}
                    onClick={() => {
                      window.setTimeout(() => {
                        void invalidateAdmin();
                      }, 1000);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" /> Export audit
                  </a>
                </Button>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <Table>
                <TableBody>
                  <HealthRow label="Database" value={health.database || "-"} />
                  <HealthRow label="Active users" value={health.activeUsers} />
                  <HealthRow label="Inactive users" value={health.inactiveUsers} />
                  <HealthRow label="Stored files" value={health.storedFiles} />
                  <HealthRow label="Scan results" value={health.scanResults} />
                  <HealthRow label="Open failed jobs" value={health.openFailedJobs} />
                  <HealthRow label="Active logs" value={health.activeLogs} />
                  <HealthRow label="Archived logs" value={health.archivedLogs} />
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Failed logins" value={security.failedLoginAttempts} icon={ShieldAlert} />
            <MetricCard label="Upload rejections" value={security.uploadRejections} icon={AlertTriangle} />
            <MetricCard label="Suspicious scans" value={security.suspiciousScans} icon={FileWarning} />
            <MetricCard label="Corrupted scans" value={security.corruptedScans} icon={FileWarning} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Risk count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {security.highRiskTypes.map((type) => (
                    <TableRow key={type.type}>
                      <TableCell className="font-medium">{type.type}</TableCell>
                      <TableCell>{type.count}</TableCell>
                    </TableRow>
                  ))}
                  {security.highRiskTypes.length === 0 && <EmptyRow colSpan={2} text="No high-risk file types found." />}
                </TableBody>
              </Table>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {security.events.map((event, index) => (
                    <TableRow key={`${event.date}-${event.event}-${index}`}>
                      <TableCell>{event.date}</TableCell>
                      <TableCell>{event.event}</TableCell>
                      <TableCell>{event.ipAddress}</TableCell>
                      <TableCell className="text-muted-foreground">{event.notes}</TableCell>
                    </TableRow>
                  ))}
                  {security.events.length === 0 && <EmptyRow colSpan={4} text="No security events found." />}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !confirmationBusy) {
            setPendingConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmationBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingConfirm?.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              disabled={confirmationBusy}
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              {pendingConfirm?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SearchInput({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  value,
  values,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  values: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function HealthRow({ label, value }: { label: string; value: number | string }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-right">{value}</TableCell>
    </TableRow>
  );
}
