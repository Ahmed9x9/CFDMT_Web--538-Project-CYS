import { type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download, KeyRound, LogOut, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accountActivityExportUrl,
  changePassword,
  clearHistory,
  getSettings,
  updateSettings,
  type UserSettings,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";

const defaultSettings: UserSettings = {
  theme: "system",
  defaultScanProfile: "full",
  emailNotifications: true,
  defaultUploadAction: "upload_only",
  showExpiredFiles: true,
  preferredFileView: "detailed",
  hideClearedHistory: true,
};

function applyThemePreference(theme: UserSettings["theme"]) {
  const systemLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const useLight = theme === "light" || (theme === "system" && systemLight);
  document.documentElement.classList.toggle("light", useLight);
  localStorage.setItem("cfdmt-theme", theme);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "No record";
  }

  return new Date(value).toLocaleString();
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(false);

  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setName(data.user.name);
    setSettings(data.settings);
  }, [data]);

  const setSetting = <Key extends keyof UserSettings>(key: Key, value: UserSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: () => updateSettings({ name, ...settings }),
    onSuccess: async () => {
      applyThemePreference(settings.theme);
      await Promise.all([
        refreshUser(),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["app-state"] }),
      ]);
      toast.success("Settings saved.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword, confirmPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not change password.");
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => clearHistory({ mode: "all" }),
    onSuccess: async ({ cleared }) => {
      setConfirmDeleteHistory(false);
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success(`Deleted ${cleared.actions} visible history entries.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete history.");
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const security = data?.security;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, preferences, and privacy."
        actions={
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save changes
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Full name">
              <Input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required />
            </Field>
            <Field label="Email">
              <Input value={user?.email ?? data?.user.email ?? ""} disabled />
            </Field>
            <InfoRow label="Account status" value={security?.accountStatus ?? "Active"} />
            <InfoRow label="Joined date" value={security?.joinedDate ?? user?.joined ?? "-"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Current password">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Button className="w-fit" onClick={() => passwordMutation.mutate()} disabled={passwordMutation.isPending}>
              <KeyRound className="mr-2 h-4 w-4" /> Change password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Theme">
              <Select value={settings.theme} onValueChange={(value) => setSetting("theme", value as UserSettings["theme"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Default scan profile">
              <Select
                value={settings.defaultScanProfile}
                onValueChange={(value) => setSetting("defaultScanProfile", value as UserSettings["defaultScanProfile"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ToggleRow
              label="Email notifications"
              checked={settings.emailNotifications}
              onCheckedChange={(checked) => setSetting("emailNotifications", checked)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <InfoRow label="Last login date" value={formatDateTime(security?.lastLoginDate)} />
            <InfoRow label="Recent failed login count" value={String(security?.recentFailedLoginCount ?? 0)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Log out from current session
              </Button>
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setConfirmDeleteHistory(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete my visible history
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File Handling</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Default action after upload">
              <Select
                value={settings.defaultUploadAction}
                onValueChange={(value) => setSetting("defaultUploadAction", value as UserSettings["defaultUploadAction"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upload_only">Upload only</SelectItem>
                  <SelectItem value="upload_and_scan">Upload and scan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <ToggleRow
              label="Show expired files in lists"
              checked={settings.showExpiredFiles}
              onCheckedChange={(checked) => setSetting("showExpiredFiles", checked)}
            />
            <Field label="Preferred file table view">
              <Select
                value={settings.preferredFileView}
                onValueChange={(value) => setSetting("preferredFileView", value as UserSettings["preferredFileView"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ToggleRow
              label="Hide cleared history from my pages"
              checked={settings.hideClearedHistory}
              onCheckedChange={(checked) => setSetting("hideClearedHistory", checked)}
            />
            <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Admins see anonymized system activity only.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <a href={accountActivityExportUrl()}>
                <Download className="mr-2 h-4 w-4" /> Download my account activity as CSV
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDeleteHistory} onOpenChange={setConfirmDeleteHistory}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete visible history?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your visible history, scan results, and repair activity from your pages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearHistoryMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearHistoryMutation.isPending}
              onClick={() => clearHistoryMutation.mutate()}
            >
              Delete history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/20 px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
