import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, ScanLine, Wrench, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { deleteFile, downloadFileUrl, emptyState, getState, repairFile, scanFile } from "@/lib/api";

export default function FileDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { data = emptyState, isLoading } = useQuery({
    queryKey: ["app-state"],
    queryFn: getState,
  });
  const scanMutation = useMutation({
    mutationFn: scanFile,
    onSuccess: async ({ file: scannedFile }) => {
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success(`Scan completed: ${scannedFile.status}.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Scan failed.");
    },
  });
  const repairMutation = useMutation({
    mutationFn: repairFile,
    onSuccess: async ({ repair }) => {
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      if (repair.success) {
        toast.success(repair.message || "Repair completed.");
      } else {
        toast.error(repair.message || "Repair failed.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Repair failed.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: async () => {
      setConfirmDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success("File deleted from your pages.");
      navigate("/scan-results");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete file.");
    },
  });
  const file = data.files.find((f) => f.id === id);

  if (!file) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/scan-results"><ArrowLeft className="mr-2 h-4 w-4" /> Back to results</Link>
        </Button>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading file details..." : "File not found. Upload and scan a file first."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const accessExpired = Boolean(file.isExpired);
  const expiresLabel = file.expiresAt ? new Date(file.expiresAt).toLocaleString() : "the configured access time";
  const canScan = !accessExpired && file.status === "Pending";
  const canRepair = !accessExpired && (file.status === "Corrupted" || file.status === "Suspicious");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/scan-results"><ArrowLeft className="mr-2 h-4 w-4" /> Back to results</Link>
      </Button>

      <PageHeader
        title={file.name}
        description={`${file.type} - ${file.size} - uploaded ${file.date}`}
        actions={<StatusBadge status={file.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>File information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Row label="Name" value={file.name} />
            <Row label="Type" value={file.type} />
            <Row label="Size" value={file.size} />
            <Row label="Uploaded by" value={file.user} />
            <Row label="Date" value={file.date} />
            <Row label="SHA-256" value={<span className="font-mono text-xs">{file.fullHash || file.hash}</span>} />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidence</p>
              <p className="mt-1 rounded-md border border-border bg-muted/40 p-3 text-sm">{file.evidence}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {accessExpired ? (
              <Button className="w-full justify-start" variant="outline" disabled>
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            ) : (
              <Button asChild className="w-full justify-start" variant="outline">
                <a href={downloadFileUrl(file.id)}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </Button>
            )}
            {file.repairedDownloadUrl && !accessExpired && (
              <Button asChild className="w-full justify-start" variant="outline">
                <a href={file.repairedDownloadUrl}>
                  <Download className="mr-2 h-4 w-4" /> Download repaired
                </a>
              </Button>
            )}
            <Button
              className="w-full justify-start"
              onClick={() => scanMutation.mutate(file.id)}
              disabled={!canScan || scanMutation.isPending}
            >
              <ScanLine className="mr-2 h-4 w-4" /> Scan
            </Button>
            <Button
              className="w-full justify-start"
              onClick={() => repairMutation.mutate(file.id)}
              disabled={!canRepair || repairMutation.isPending}
            >
              <Wrench className="mr-2 h-4 w-4" /> Repair
            </Button>
            <Button
              className="w-full justify-start"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
            {accessExpired && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Download, scan, and repair expired on {expiresLabel}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {file.name} from your scan results, repair center, and visible history. System totals are kept anonymized for admin reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(file.id)}
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
