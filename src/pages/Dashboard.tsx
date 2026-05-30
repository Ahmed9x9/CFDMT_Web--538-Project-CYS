import { FileUp, ScanLine, Wrench, FileWarning, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/app/MetricCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { emptyState, getState } from "@/lib/api";

export default function Dashboard() {
  const { data = emptyState } = useQuery({
    queryKey: ["app-state"],
    queryFn: getState,
  });
  const { actions, files, metrics } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of file integrity activity." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Uploaded files" value={metrics.totalUploaded} icon={FileUp} />
        <MetricCard label="Total scans" value={metrics.totalScans} icon={ScanLine} />
        <MetricCard label="Corrupted" value={metrics.corrupted} icon={FileWarning} />
        <MetricCard label="Repaired" value={metrics.repaired} icon={Wrench} />
        <MetricCard label="Recent actions" value={metrics.recentActions} icon={Activity} />
      </div>

      <div className="grid min-w-0 gap-4 min-[1320px]:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead className="w-[90px]">Size</TableHead>
                  <TableHead className="w-[110px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.slice(0, 5).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.date}</TableCell>
                    <TableCell className="font-medium">{a.file}</TableCell>
                    <TableCell>{a.fileType ?? "-"}</TableCell>
                    <TableCell>{a.fileSize ?? "-"}</TableCell>
                    <TableCell>{a.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Recent scans</CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.slice(0, 5).map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell><StatusBadge status={f.status} /></TableCell>
                    <TableCell>{f.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}