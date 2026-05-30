import { useState } from "react";
import { Wrench, CheckCircle2, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteFile, emptyState, getState, repairFile } from "@/lib/api";

export default function Repair() {
  const queryClient = useQueryClient();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { data = emptyState, isLoading, error } = useQuery({
    queryKey: ["app-state"],
    queryFn: getState,
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
      setPendingDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success("File deleted from your pages.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not delete file.");
    },
  });
  const needsRepair = data.files.filter((f) => (f.status === "Corrupted" || f.status === "Suspicious") && !f.isExpired);
  const repaired = data.files.filter((f) => f.status === "Repaired");
  const pendingDeleteFile = data.files.find((f) => f.id === pendingDeleteId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repair center"
        description="Recover corrupted or suspicious files and restore integrity."
      />

      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardContent className="p-4">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/30">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Files needing repair</p>
              <p className="text-xs text-muted-foreground">{needsRepair.length} candidates detected</p>
            </div>
          </div>
          {needsRepair.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm">
                {isLoading ? "Loading repair candidates..." : error ? "Start the PHP API server to load repair candidates." : "All files are healthy."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File name</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {needsRepair.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.evidence}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    <TableCell>{f.date}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => repairMutation.mutate(f.id)}
                          disabled={repairMutation.isPending}
                        >
                          <Wrench className="mr-1.5 h-3.5 w-3.5" /> Repair
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setPendingDeleteId(f.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-4 text-sm font-semibold text-foreground">Recently repaired</p>
          {repaired.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No repaired files yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Repaired on</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repaired.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground">{f.type}</TableCell>
                    <TableCell>{f.date}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {pendingDeleteFile?.name ?? "this file"} from your scan results, repair center, and visible history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || pendingDeleteId === null}
              onClick={() => pendingDeleteId && deleteMutation.mutate(pendingDeleteId)}
            >
              Delete file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}