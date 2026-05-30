import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ScanLine, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { emptyState, getSettings, getState, scanFile } from "@/lib/api";
import type { FileStatus } from "@/lib/types";

export default function ScanResults() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const { data = emptyState, isLoading, error } = useQuery({
    queryKey: ["app-state"],
    queryFn: getState,
  });
  const { data: settingsState } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const scanMutation = useMutation({
    mutationFn: scanFile,
    onSuccess: async ({ file }) => {
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success(`Scan completed: ${file.status}.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Scan failed.");
    },
  });
  const detailedView = settingsState?.settings.preferredFileView !== "compact";

  const rows = data.files.filter((f) => {
    const matchQ = f.name.toLowerCase().includes(q.toLowerCase());
    const matchS = status === "all" || f.status === (status as FileStatus);
    return matchQ && matchS;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Scan results" description="All scanned and uploaded files with their integrity status." />

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by file name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Clean">Clean</SelectItem>
                <SelectItem value="Suspicious">Suspicious</SelectItem>
                <SelectItem value="Corrupted">Corrupted</SelectItem>
                <SelectItem value="Repaired">Repaired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File name</TableHead>
                <TableHead>Type</TableHead>
                {detailedView && <TableHead>Size</TableHead>}
                {detailedView && <TableHead>SHA-256</TableHead>}
                <TableHead>Status</TableHead>
                {detailedView && <TableHead>Evidence</TableHead>}
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => {
                const canScan = f.status === "Pending" && !f.isExpired;
                return (
                  <TableRow
                    key={f.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/files/${f.id}`)}
                  >
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.type}</TableCell>
                    {detailedView && <TableCell>{f.size}</TableCell>}
                    {detailedView && <TableCell className="font-mono text-xs text-muted-foreground">{f.hash}</TableCell>}
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    {detailedView && <TableCell className="text-sm text-muted-foreground">{f.evidence}</TableCell>}
                    <TableCell>{f.date}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canScan && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              scanMutation.mutate(f.id);
                            }}
                            disabled={scanMutation.isPending}
                          >
                            <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Scan
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/files/${f.id}`); }}>
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={detailedView ? 8 : 5} className="py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading scan results..." : error ? "Start the PHP API server to load scan results." : "No files match your filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}