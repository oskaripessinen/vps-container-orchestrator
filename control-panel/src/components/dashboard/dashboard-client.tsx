"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  EllipsisVertical,
  FolderGit2,
  GitBranch,
  Github,
  Lock,
  Rocket,
  Search,
} from "lucide-react";

import { ProfileDropdown } from "@/components/auth/profile-dropdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SourceRepo = {
  name: string;
  fullName: string;
  private: boolean;
  visibility: string;
  defaultBranch: string;
  pushedAt: string | null;
};

type DeployFeedback = {
  status: "success" | "error";
  title: string;
  detail: string;
};

type VpsStatus = {
  hostname: string;
  uptimeSeconds: number;
  loadAverage1m: number;
  memory: {
    usedPercent: number;
    usedGb: number;
    totalGb: number;
  };
};

const NAV_ITEMS = [
  {
    key: "repositories",
    label: "Repositories",
    icon: FolderGit2,
    disabled: false,
  },
  {
    key: "deployments",
    label: "Deployments",
    icon: Rocket,
    disabled: true,
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
    disabled: true,
  },
] as const;

function slugifyRepoName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

function formatRepoDate(value: string | null) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  if (diffMs < oneHour) {
    const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return `${mins} min ago`;
  }

  if (diffMs < oneDay) {
    const hours = Math.max(1, Math.floor(diffMs / oneHour));
    return `${hours} h ago`;
  }

  if (diffMs < 7 * oneDay) {
    const days = Math.max(1, Math.floor(diffMs / oneDay));
    return `${days} d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0m";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  return `${Math.max(1, mins)}m`;
}

export function DashboardClient() {
  const [repos, setRepos] = useState<SourceRepo[]>([]);
  const [githubLogin, setGithubLogin] = useState<string>("github-user");
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportingRepo, setIsImportingRepo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DeployFeedback | null>(null);
  const [vpsStatus, setVpsStatus] = useState<VpsStatus | null>(null);
  const [isLoadingVpsStatus, setIsLoadingVpsStatus] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogRepo, setDialogRepo] = useState<SourceRepo | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [internalPort, setInternalPort] = useState("3000");

  useEffect(() => {
    const loadRepos = async () => {
      setIsLoadingRepos(true);

      try {
        const response = await fetch("/api/github/repos", { cache: "no-store" });
        const data = (await response.json()) as {
          githubLogin?: string;
          repos?: SourceRepo[];
          error?: string;
          detail?: string;
        };

        if (!response.ok || !data.repos) {
          throw new Error(data.detail || data.error || "Failed to load repositories");
        }

        setGithubLogin(data.githubLogin ?? "github-user");
        setRepos(data.repos);
      } catch (error) {
        setFeedback({
          status: "error",
          title: "Could not fetch repositories",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsLoadingRepos(false);
      }
    };

    const loadVpsStatus = async () => {
      setIsLoadingVpsStatus(true);

      try {
        const response = await fetch("/api/vps/status", { cache: "no-store" });
        const data = (await response.json()) as VpsStatus & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to load VPS status");
        }

        setVpsStatus(data);
      } catch {
        setVpsStatus(null);
      } finally {
        setIsLoadingVpsStatus(false);
      }
    };

    void loadRepos();
    void loadVpsStatus();
  }, []);

  const filteredRepos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return repos.filter((repo) => {
      if (!query) {
        return true;
      }

      return (
        repo.name.toLowerCase().includes(query) ||
        repo.fullName.toLowerCase().includes(query)
      );
    });
  }, [repos, searchTerm]);

  const slugPreview = slugifyRepoName(projectName || dialogRepo?.name || "");

  const openImportDialog = (repo: SourceRepo) => {
    setDialogRepo(repo);
    setProjectName(repo.name);
    setSourceRef(repo.defaultBranch || "main");
    setInternalPort("3000");
    setIsDialogOpen(true);
  };

  const importRepo = async () => {
    if (!dialogRepo) {
      return;
    }

    const port = Number(internalPort);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setFeedback({
        status: "error",
        title: "Invalid port",
        detail: "Internal port must be between 1 and 65535.",
      });
      return;
    }

    const slug = slugifyRepoName(projectName || dialogRepo.name);
    if (!slug) {
      setFeedback({
        status: "error",
        title: "Invalid project name",
        detail: "Project name must contain at least one letter or number.",
      });
      return;
    }

    setFeedback(null);
    setIsImportingRepo(dialogRepo.fullName);

    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appSlug: slug,
          internalPort: port,
          sourceRepo: dialogRepo.name,
          sourceRef,
        }),
      });

      const data = (await response.json()) as {
        workflowUrl?: string;
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Import failed");
      }

      setFeedback({
        status: "success",
        title: "Import queued",
        detail: data.workflowUrl
          ? `Build and deploy started: ${data.workflowUrl}`
          : "Build and deploy workflow started.",
      });

      setIsDialogOpen(false);
    } catch (error) {
      setFeedback({
        status: "error",
        title: "Import failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsImportingRepo(null);
    }
  };

  return (
    <>
      <div className="relative h-[100dvh] overflow-hidden">
        <SidebarProvider defaultOpen className="relative h-full">
          <Sidebar className="sticky top-0 self-start">
            <SidebarHeader className="flex h-14 items-center pl-4 pr-2">
              <div className="mt-2 flex w-full items-center gap-3">
                <ProfileDropdown afterSignOutUrl="/login" menuClassName="w-72" />
                <div className="min-w-0 flex-1 group-data-[state=collapsed]/sidebar:hidden">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">{githubLogin}</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="no-scrollbar px-3 py-4">
              <SidebarGroup className="animate-slide-in">
                <SidebarGroupLabel className="group-data-[state=collapsed]/sidebar:hidden">
                  Workspace
                </SidebarGroupLabel>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          type="button"
                          size="lg"
                          isActive={!item.disabled}
                          disabled={item.disabled}
                          className={cn(
                            "h-11",
                            item.disabled && "cursor-not-allowed opacity-55"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex min-w-0 flex-col items-start leading-tight group-data-[state=collapsed]/sidebar:hidden">
                            <span>{item.label}</span>
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border/80 p-4 group-data-[state=collapsed]/sidebar:hidden">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Card className="gap-1 border-sidebar-border/70 bg-sidebar-accent/50 py-2 shadow-none">
                  <CardContent className="px-2">
                    <p className="text-muted-foreground">Uptime</p>
                    <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
                      {isLoadingVpsStatus
                        ? "..."
                        : vpsStatus
                          ? formatUptime(vpsStatus.uptimeSeconds)
                          : "n/a"}
                    </p>
                  </CardContent>
                </Card>
                <Card className="gap-1 border-sidebar-border/70 bg-sidebar-accent/50 py-2 shadow-none">
                  <CardContent className="px-2">
                    <p className="text-muted-foreground">Load / Mem</p>
                    <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
                      {isLoadingVpsStatus
                        ? "..."
                        : vpsStatus
                          ? `${vpsStatus.loadAverage1m.toFixed(2)} / ${vpsStatus.memory.usedPercent}%`
                          : "n/a"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="sticky top-0 z-40 shrink-0 border-b border-border/80 bg-background/90 backdrop-blur-xl">
              <div className="relative flex h-14 items-center px-3">
                <SidebarTrigger className="shrink-0" />
                <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground">
                  Deploy
                </p>
                <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground">
                  <EllipsisVertical className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
              </div>
            </header>

            <main className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
              <Card className="animate-fade-up gap-0 border-border/80 bg-background/60 py-0">
                <CardHeader className="flex flex-col gap-4 py-4 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl space-y-1">
                    <CardTitle className="text-lg tracking-tight sm:text-xl">Deploy</CardTitle>
                    <CardDescription>
                      Import a GitHub repository and queue a new deployment workflow.
                    </CardDescription>
                  </div>

                  <div className="w-full lg:max-w-2xl">
                    <Label htmlFor="repo-search" className="sr-only">
                      Search repositories
                    </Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="repo-search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search by repository name"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {feedback && (
                <Alert
                  className="animate-fade-up animation-delay-100"
                  variant={feedback.status === "error" ? "destructive" : "default"}
                >
                  <AlertTitle>{feedback.title}</AlertTitle>
                  <AlertDescription className="break-all">{feedback.detail}</AlertDescription>
                </Alert>
              )}

              <Card className="animate-fade-up animation-delay-150 min-h-0 flex-1 gap-0 overflow-hidden border-border/80 bg-background/60 py-0">
                <CardContent className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-0 py-0">
                  <Table className="table-fixed">
                    <colgroup>
                      <col className="w-[52%]" />
                      <col className="w-[18%]" />
                      <col className="w-[18%]" />
                      <col className="w-[12%]" />
                    </colgroup>
                    <TableBody>
                      {isLoadingRepos ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="px-6 py-8 text-center text-sm text-muted-foreground"
                          >
                            Loading repositories...
                          </TableCell>
                        </TableRow>
                      ) : filteredRepos.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="space-y-2 px-6 py-8 text-center text-sm text-muted-foreground whitespace-normal"
                          >
                            <p>No repositories found.</p>
                            <p className="text-xs">
                              Ensure GitHub OAuth scopes include `repo`, then sign out and sign
                              in again.
                            </p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRepos.map((repo, index) => (
                          <TableRow
                            key={repo.fullName}
                            className="animate-fade-up"
                            style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
                          >
                            <TableCell className="min-w-0 max-w-0 px-6 py-3 whitespace-normal">
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium text-foreground">
                                  {repo.name}
                                  {repo.private ? (
                                    <Lock className="ml-2 inline h-3.5 w-3.5 text-muted-foreground" />
                                  ) : null}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {repo.fullName}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell className="px-6 py-3">
                              <Badge
                                variant={repo.private ? "secondary" : "outline"}
                                className={cn(
                                  "uppercase",
                                  !repo.private &&
                                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                )}
                              >
                                {repo.visibility}
                              </Badge>
                            </TableCell>

                            <TableCell className="px-6 py-3 text-muted-foreground">
                              {formatRepoDate(repo.pushedAt)}
                            </TableCell>

                            <TableCell className="px-6 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-4"
                                disabled={isImportingRepo === repo.fullName}
                                onClick={() => openImportDialog(repo)}
                              >
                                {isImportingRepo === repo.fullName ? "Importing..." : "Import"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl rounded-lg border-border/80 bg-background/95 p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl">Deploy repository</DialogTitle>
            <DialogDescription>
              Set project name, ref, and internal port for this app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="gap-0 border-border/80 bg-muted/30 py-0 shadow-none">
              <CardHeader className="gap-1 pb-3">
                <CardDescription className="text-xs font-medium tracking-[0.1em] uppercase">
                  Source
                </CardDescription>
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Github className="h-4 w-4" />
                  {dialogRepo?.fullName ?? "-"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  {sourceRef}
                </p>
              </CardContent>
            </Card>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={dialogRepo?.name ?? "my-project"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-slug">App Slug</Label>
                <Input
                  id="app-slug"
                  readOnly
                  value={slugPreview || "invalid"}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="git-ref">Git Ref</Label>
                <Input
                  id="git-ref"
                  value={sourceRef}
                  onChange={(event) => setSourceRef(event.target.value)}
                  placeholder={dialogRepo?.defaultBranch ?? "main"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="internal-port">Internal Port</Label>
                <Input
                  id="internal-port"
                  value={internalPort}
                  onChange={(event) => setInternalPort(event.target.value)}
                  placeholder="3000"
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsDialogOpen(false);
              }}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="min-w-28"
              disabled={isImportingRepo !== null || !slugPreview}
              onClick={() => {
                void importRepo();
              }}
            >
              {isImportingRepo ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
