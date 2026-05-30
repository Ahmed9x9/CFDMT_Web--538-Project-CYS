import { Link } from "react-router-dom";
import { Upload, ScanLine, Wrench, History, FileSearch, ArrowRight, FileText, Info, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: Upload, title: "File upload", desc: "Drag and drop files for instant integrity inspection." },
  { icon: ScanLine, title: "Corruption scan", desc: "Hash, parse, and flag suspicious or corrupted files." },
  { icon: Info, title: "Clear explanation", desc: "Plain-language reports that pinpoint exactly what's wrong with each file." },
  { icon: Wrench, title: "Repair", desc: "Recover broken files and restore integrity in one click." },
  { icon: History, title: "History logs", desc: "A signed audit trail of every action on every file." },
  { icon: FileText, title: "Focused format support", desc: "Supports PNG, JPG, PDF, ZIP, RAR, and 7Z files." },
];

export default function Index() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-gradient-hero">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(hsl(var(--primary)/0.08)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_30%,black,transparent)]" />
        <div className="container relative flex flex-col items-center gap-6 py-24 text-center">
          <p className="font-display text-5xl font-bold text-primary sm:text-6xl">CFDMT Web</p>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Detect, repair and{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">secure corrupted files</span>
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Corrupted File Detection and Management Tool Web inspects uploaded files, repairs
            what it can, and keeps scan, repair, and audit records in one place.
          </p>
          <div className="flex gap-3">
            <Button asChild size="lg" className="bg-gradient-primary shadow-glow hover:opacity-90">
              <Link to="/register">Create account <UserPlus className="ml-1.5 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary/30 hover:bg-primary/10">
              <Link to="/login">Login <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
          </div>

          <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "/login", t: "Dashboard" },
              { l: "/login", t: "Upload" },
              { l: "/login", t: "Scans" },
              { l: "/login", t: "Repair" },
            ].map((q) => (
              <Button key={q.t} asChild variant="ghost" className="border border-border/60 bg-card/40 backdrop-blur hover:border-primary/40 hover:bg-primary/10">
                <Link to={q.l}>{q.t}</Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="mb-10 flex flex-col items-center gap-2 text-center">
          <span className="text-xs uppercase tracking-[0.2em] text-primary">Capabilities</span>
          <h2 className="text-3xl font-semibold text-foreground">Everything you need to keep files clean</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="group relative overflow-hidden border-border/60 bg-gradient-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <CardContent className="flex flex-col items-start gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card/40">
        <div className="container grid gap-6 py-12 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <FileSearch className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Deep inspection</p>
              <p className="text-sm text-muted-foreground">SHA-256 hashing and structural parsing on every upload.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Wrench className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Smart repair</p>
              <p className="text-sm text-muted-foreground">Recover salvageable files automatically when possible.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Focused format support</p>
              <p className="text-sm text-muted-foreground">Handles PNG, JPG, PDF, ZIP, RAR, and 7Z files.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
