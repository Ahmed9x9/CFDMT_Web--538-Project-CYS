import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearHistory, emptyState, getState } from "@/lib/api";

type ClearMode = "entry" | "last24h" | "last7days" | "lastWeek" | "all";

type PendingClear = {
  entryId?: string;
  label: string;
  mode: ClearMode;
};

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [pendingClear, setPendingClear] = useState<PendingClear | null>(null);
  const { data = emptyState, isLoading, error } = useQuery({
    queryKey: ["app-state"],
    queryFn: getState,
  });
  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: async ({ cleared }) => {
      setPendingClear(null);
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success(`Cleared ${cleared.actions} history entries.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not clear history.");
    },
  });
  const actions = data.actions;
  const rows = actions.filter((a) =>
    (action === "all" || a.action === action) &&
    a.file.toLowerCase().includes(q.toLowerCase())
  );
  const allActions = Array.from(new Set(actions.map((a) => a.action)));
  const requestClear = (pending: PendingClear) => {
    setPendingClear(pending);
  };
  const confirmClear = () => {
    if (!pendingClear) {
      return;
    }
    clearMutation.mutate({ mode: pendingClear.mode, entryId: pendingClear.entryId });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="History" description="Audit log of all actions." />
      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Search by file" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {allActions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete history
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => requestClear({ mode: "last24h", label: "the last 24 hours" })}>
                  Delete last 24 hours
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => requestClear({ mode: "last7days", label: "the last 7 days" })}>
                  Delete last 7 days
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => requestClear({ mode: "lastWeek", label: "last week" })}>
                  Delete last week
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                  onClick={() => requestClear({ mode: "all", label: "all history" })}
                >
                  Delete all history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Delete history</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.date}</TableCell>
                  <TableCell className="font-medium">{a.file}</TableCell>
                  <TableCell>{a.action}</TableCell>
                  <TableCell className="text-muted-foreground">{a.notes || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => requestClear({ mode: "entry", entryId: a.id, label: `${a.action} for ${a.file}` })}
                      disabled={clearMutation.isPending}
                      aria-label={`Delete ${a.action} history`}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading history..." : error ? "Start the PHP API server to load history." : "No actions match your filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={pendingClear !== null} onOpenChange={(open) => !open && setPendingClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete history?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {pendingClear?.label} from your history, scan results, and repair activity views.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearMutation.isPending}
              onClick={confirmClear}
            >
              Delete history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
