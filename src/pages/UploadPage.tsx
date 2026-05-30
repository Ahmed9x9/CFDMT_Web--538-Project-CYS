import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileUp, Info, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSettings, uploadFile } from "@/lib/api";

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: settingsState } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const userSettings = settingsState?.settings;
  const policy = settingsState?.policy;
  const maxUploadSizeMb = policy?.maxUploadSizeMb ?? 50;
  const allowedExtensions = policy?.allowedExtensions ?? ["png", "jpg", "jpeg", "pdf", "zip", "rar", "7z"];
  const fileAccessWindowLabel = policy?.fileAccessWindowLabel ?? "24 hours";
  const defaultScanProfile = userSettings?.defaultScanProfile ?? "full";
  const uploadMutation = useMutation({
    mutationFn: ({ selectedFile, scan }: { selectedFile: File; scan: boolean }) =>
      uploadFile(selectedFile, scan, defaultScanProfile),
    onSuccess: async ({ file: uploadedFile }, { scan }) => {
      await queryClient.invalidateQueries({ queryKey: ["app-state"] });
      toast.success(scan ? `Uploaded and scanned ${uploadedFile.name}` : `Uploaded ${uploadedFile.name}`);
      setFile(null);
      navigate(scan ? "/scan-results" : `/files/${uploadedFile.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    },
  });

  const validate = (f: File | null) => {
    if (!f) return "Please choose a file.";
    const extension = f.name.includes(".") ? f.name.split(".").pop()?.toLowerCase() ?? "" : "";
    if (!extension || !allowedExtensions.includes(extension)) return "This file type is not allowed.";
    if (f.size > maxUploadSizeMb * 1024 * 1024) return `Max file size is ${maxUploadSizeMb} MB.`;
    return null;
  };

  const handleSubmit = (scan: boolean) => {
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    uploadMutation.mutate({ selectedFile: file!, scan });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Upload file" description="Send a file for integrity inspection." />

      <Card>
        <CardContent className="p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 p-12 text-center transition hover:border-primary hover:bg-accent/40"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {file ? file.name : "Drag & drop a file or click to choose"}
            </p>
            <p className="text-xs text-muted-foreground">
              Allowed: {allowedExtensions.map((extension) => extension.toUpperCase()).join(", ")} - Max {maxUploadSizeMb} MB
            </p>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Uploaded files are available for download, scan, and repair for {fileAccessWindowLabel}. After {fileAccessWindowLabel}, file access and processing actions are disabled.</p>
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => handleSubmit(true)} disabled={uploadMutation.isPending}>
              <ScanLine className="mr-2 h-4 w-4" /> Upload and scan
            </Button>
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={uploadMutation.isPending}>
              <FileUp className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
