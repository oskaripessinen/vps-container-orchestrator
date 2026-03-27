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
  Trash2,
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
  TableHead,
  TableHeader,
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
  timestamp: string;
  hostname: string;
  uptimeSeconds: number;
  cpu: {
    cores: number;
    usedPercent: number;
    loadAverage1m: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    usedGb: number;
    totalGb: number;
  };
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    appSlug: string | null;
    composeService: string | null;
    cpuPercent: number;
    memory: {
      usedBytes: number;
      limitBytes: number;
      usedPercent: number;
    };
    network: {
      rxBytes: number;
      txBytes: number;
    };
    pids: number;
  }>;
};

const NAV_ITEMS = [
  {
    key: "repositories",
    label: "Deploy",
    icon: FolderGit2,
    disabled: false,
  },
  {
    key: "deployments",
    label: "Deployments",
    icon: Rocket,
    disabled: false,
  },
  {
    key: "activity",
    label: "Activity",
    icon: Activity,
    disabled: false,
  },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

type DeploymentSummary = {
  appSlug: string;
  containers: VpsStatus["containers"];
  services: string[];
  state: string;
  status: string;
  images: string[];
  totalPids: number;
  totalCpuPercent: number;
};

const SHARED_INFRA_CONTAINER_NAMES = new Set([
  "traefik",
  "watchtower",
  "vps-metrics-api",
  "nginx-proxy-manager",
]);

function resolveDeploymentSlug(container: VpsStatus["containers"][number]) {
  if (container.appSlug) {
    return container.appSlug;
  }

  const composeStyleMatch = container.name.match(/^(.*)-[^-]+-\d+$/);
  if (composeStyleMatch?.[1]) {
    return composeStyleMatch[1];
  }

  return container.name;
}

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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function DashboardClient() {
  const [activeView, setActiveView] = useState<NavKey>("repositories");
  const [repos, setRepos] = useState<SourceRepo[]>([]);
  const [githubLogin, setGithubLogin] = useState<string>("github-user");
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportingRepo, setIsImportingRepo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DeployFeedback | null>(null);
  const [vpsStatus, setVpsStatus] = useState<VpsStatus | null>(null);
  const [isLoadingVpsStatus, setIsLoadingVpsStatus] = useState(true);
  const [isDeletingApp, setIsDeletingApp] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dialogRepo, setDialogRepo] = useState<SourceRepo | null>(null);
  const [pendingDeleteDeployment, setPendingDeleteDeployment] = useState<DeploymentSummary | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [internalPort, setInternalPort] = useState("3000");
  const [envVars, setEnvVars] = useState("");

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

    void loadRepos();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadVpsStatus = async (initialLoad = false) => {
      if (initialLoad) {
        setIsLoadingVpsStatus(true);
      }

      try {
        const response = await fetch("/api/vps/status", { cache: "no-store" });
        const data = (await response.json()) as VpsStatus & {
          error?: string;
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(data.detail || data.error || "Failed to load VPS status");
        }

        if (!isMounted) {
          return;
        }

        setVpsStatus(data);
      } catch {
        if (!isMounted) {
          return;
        }

        setVpsStatus(null);
      } finally {
        if (initialLoad && isMounted) {
          setIsLoadingVpsStatus(false);
        }
      }
    };

    void loadVpsStatus(true);

    const pollHandle = setInterval(() => {
      void loadVpsStatus();
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollHandle);
    };
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

  const topContainers = useMemo(() => {
    if (!vpsStatus) {
      return [];
    }

    return vpsStatus.containers.slice(0, 8);
  }, [vpsStatus]);

  const deployedContainers = useMemo(() => {
    return (vpsStatus?.containers ?? []).filter(
      (container) => !SHARED_INFRA_CONTAINER_NAMES.has(container.name)
    );
  }, [vpsStatus]);

  const deployments = useMemo<DeploymentSummary[]>(() => {
    const groups = new Map<string, DeploymentSummary>();

    for (const container of deployedContainers) {
      const appSlug = resolveDeploymentSlug(container);
      const existing = groups.get(appSlug);

      if (existing) {
        existing.containers.push(container);
        existing.totalPids += container.pids;
        existing.totalCpuPercent += container.cpuPercent;
        if (!existing.images.includes(container.image)) {
          existing.images.push(container.image);
        }
        if (container.composeService && !existing.services.includes(container.composeService)) {
          existing.services.push(container.composeService);
        }
        if (existing.state !== container.state) {
          existing.state = existing.state === "running" ? container.state : existing.state;
        }
        if (existing.status !== container.status) {
          existing.status = `${existing.containers.length} containers`;
        }
        continue;
      }

      groups.set(appSlug, {
        appSlug,
        containers: [container],
        services: container.composeService ? [container.composeService] : [],
        state: container.state,
        status: container.status,
        images: [container.image],
        totalPids: container.pids,
        totalCpuPercent: container.cpuPercent,
      });
    }

    return Array.from(groups.values()).sort((a, b) => a.appSlug.localeCompare(b.appSlug));
  }, [deployedContainers]);

  const activeItem = NAV_ITEMS.find((item) => item.key === activeView) ?? NAV_ITEMS[0];

  const slugPreview = slugifyRepoName(projectName || dialogRepo?.name || "");

  const openImportDialog = (repo: SourceRepo) => {
    setDialogRepo(repo);
    setProjectName(repo.name);
    setSourceRef(repo.defaultBranch || "main");
    setInternalPort("3000");
    setEnvVars("");
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
          envVars,
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

  const deleteDeployment = async (appSlug: string) => {
    setFeedback(null);
    setIsDeletingApp(appSlug);

    try {
      const response = await fetch("/api/deployments", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appSlug }),
      });

      const data = (await response.json()) as {
        workflowUrl?: string;
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Delete failed");
      }

      setFeedback({
        status: "success",
        title: "Delete queued",
        detail: data.workflowUrl
          ? `Removal started: ${data.workflowUrl}`
          : `Removal started for ${appSlug}.`,
      });

      setVpsStatus((current) =>
        current
          ? {
              ...current,
              containers: current.containers.filter(
                (container) => resolveDeploymentSlug(container) !== appSlug
              ),
            }
          : current
      );
    } catch (error) {
      setFeedback({
        status: "error",
        title: "Delete failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeletingApp(null);
    }
  };

  const openDeleteDialog = (deployment: DeploymentSummary) => {
    setPendingDeleteDeployment(deployment);
    setIsDeleteDialogOpen(true);
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
                          isActive={activeView === item.key}
                          disabled={item.disabled}
                          className={cn(
                            "h-11",
                            item.disabled && "cursor-not-allowed opacity-55"
                          )}
                          onClick={() => {
                            if (!item.disabled) {
                              setActiveView(item.key);
                            }
                          }}
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
                          ? `${vpsStatus.cpu.loadAverage1m.toFixed(2)} / ${vpsStatus.memory.usedPercent}%`
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
                  {activeItem.label}
                </p>
                <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground">
                  <EllipsisVertical className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
              </div>
            </header>

            <main className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
              {activeView === "repositories" ? (
                <>
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

                  <Card className="animate-fade-up animation-delay-200 min-h-0 flex-1 gap-0 overflow-hidden border-border/80 bg-background/60 py-0">
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
                </>
              ) : null}

              {feedback && (
                <Alert
                  className="animate-fade-up animation-delay-100"
                  variant={feedback.status === "error" ? "destructive" : "default"}
                >
                  <AlertTitle>{feedback.title}</AlertTitle>
                  <AlertDescription className="break-all">{feedback.detail}</AlertDescription>
                </Alert>
              )}

              {activeView === "deployments" ? (
                <Card className="animate-fade-up animation-delay-150 min-h-0 flex-1 gap-0 border-border/80 bg-background/60 py-0">
                  <CardHeader className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Deployments</CardTitle>
                      <CardDescription>
                        {isLoadingVpsStatus
                          ? "Loading deployments..."
                          : vpsStatus
                            ? `${deployments.length} app deployments on ${vpsStatus.hostname}`
                            : "Container list not available"}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-0 pb-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Deployment</TableHead>
                          <TableHead className="px-6">State</TableHead>
                          <TableHead className="px-6">Services / Images</TableHead>
                          <TableHead className="px-6">Usage</TableHead>
                          <TableHead className="px-6 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoadingVpsStatus ? (
                          <TableRow>
                            <TableCell colSpan={5} className="px-6 py-6 text-sm text-muted-foreground">
                              Loading deployments...
                            </TableCell>
                          </TableRow>
                        ) : !vpsStatus ? (
                          <TableRow>
                            <TableCell colSpan={5} className="px-6 py-6 text-sm text-muted-foreground">
                              Could not load container inventory.
                            </TableCell>
                          </TableRow>
                        ) : deployments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="px-6 py-6 text-sm text-muted-foreground">
                              No running containers.
                            </TableCell>
                          </TableRow>
                        ) : (
                          deployments.map((deployment) => (
                            <TableRow key={deployment.appSlug}>
                              <TableCell className="px-6 py-3 align-top whitespace-normal">
                                <p className="font-medium text-foreground">{deployment.appSlug}</p>
                                <p className="text-xs text-muted-foreground">
                                  {deployment.containers.length} container{deployment.containers.length === 1 ? "" : "s"}
                                </p>
                              </TableCell>
                              <TableCell className="px-6 py-3 align-top">
                                <Badge variant="outline" className="uppercase">
                                  {deployment.state}
                                </Badge>
                                <p className="mt-2 text-xs text-muted-foreground">{deployment.status}</p>
                              </TableCell>
                              <TableCell className="px-6 py-3 text-xs text-muted-foreground whitespace-normal">
                                {deployment.services.length > 0 ? (
                                  <p>Services {deployment.services.join(", ")}</p>
                                ) : (
                                  <p>Single container app</p>
                                )}
                                <p className="mt-1 text-sm text-foreground">{deployment.images.join(", ")}</p>
                              </TableCell>
                              <TableCell className="px-6 py-3 text-xs text-muted-foreground whitespace-normal">
                                <p>PIDs {deployment.totalPids}</p>
                                <p>CPU {deployment.totalCpuPercent.toFixed(1)}%</p>
                              </TableCell>
                              <TableCell className="px-6 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-destructive hover:text-destructive"
                                  disabled={isDeletingApp === deployment.appSlug}
                                  onClick={() => openDeleteDialog(deployment)}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  {isDeletingApp === deployment.appSlug ? "Deleting..." : "Delete"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}

              {activeView === "activity" ? (
                <>
                  <Card className="animate-fade-up animation-delay-150 gap-0 border-border/80 bg-background/60 py-0">
                    <CardHeader className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-base">VPS metrics</CardTitle>
                        <CardDescription>
                          {isLoadingVpsStatus
                            ? "Loading real-time server usage..."
                            : vpsStatus
                              ? `Updated ${formatTimestamp(vpsStatus.timestamp)} - ${vpsStatus.hostname}`
                              : "Metrics endpoint not available"}
                        </CardDescription>
                      </div>

                      {vpsStatus ? (
                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <div className="border border-border/70 bg-muted/30 px-2 py-1.5">
                            <p className="text-muted-foreground">CPU</p>
                            <p className="text-sm font-semibold text-foreground">
                              {vpsStatus.cpu.usedPercent.toFixed(1)}%
                            </p>
                          </div>
                          <div className="border border-border/70 bg-muted/30 px-2 py-1.5">
                            <p className="text-muted-foreground">Load</p>
                            <p className="text-sm font-semibold text-foreground">
                              {vpsStatus.cpu.loadAverage1m.toFixed(2)}
                            </p>
                          </div>
                          <div className="border border-border/70 bg-muted/30 px-2 py-1.5">
                            <p className="text-muted-foreground">Memory</p>
                            <p className="text-sm font-semibold text-foreground">
                              {vpsStatus.memory.usedPercent.toFixed(1)}%
                            </p>
                          </div>
                          <div className="border border-border/70 bg-muted/30 px-2 py-1.5">
                            <p className="text-muted-foreground">Containers</p>
                            <p className="text-sm font-semibold text-foreground">
                              {vpsStatus.containers.length}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </CardHeader>

                    <CardContent className="px-0 pb-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="px-6">Container</TableHead>
                            <TableHead className="px-6">CPU</TableHead>
                            <TableHead className="px-6">Memory</TableHead>
                            <TableHead className="px-6">Network</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoadingVpsStatus ? (
                            <TableRow>
                              <TableCell colSpan={4} className="px-6 py-6 text-sm text-muted-foreground">
                                Loading VPS metrics...
                              </TableCell>
                            </TableRow>
                          ) : !vpsStatus ? (
                            <TableRow>
                              <TableCell colSpan={4} className="px-6 py-6 text-sm text-muted-foreground">
                                Could not load VPS metrics. Check `VPS_METRICS_URL` and
                                `VPS_METRICS_TOKEN` in control-panel environment.
                              </TableCell>
                            </TableRow>
                          ) : topContainers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="px-6 py-6 text-sm text-muted-foreground">
                                No running containers.
                              </TableCell>
                            </TableRow>
                          ) : (
                            topContainers.map((container) => (
                              <TableRow key={container.id}>
                                <TableCell className="px-6 py-3 align-top whitespace-normal">
                                  <p className="truncate font-medium text-foreground">{container.name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{container.image}</p>
                                </TableCell>
                                <TableCell className="px-6 py-3 text-sm text-foreground">
                                  {container.cpuPercent.toFixed(1)}%
                                </TableCell>
                                <TableCell className="px-6 py-3 text-sm text-foreground whitespace-normal">
                                  {formatBytes(container.memory.usedBytes)}
                                  <span className="text-muted-foreground">
                                    {` / ${formatBytes(container.memory.limitBytes)} (${container.memory.usedPercent.toFixed(1)}%)`}
                                  </span>
                                </TableCell>
                                <TableCell className="px-6 py-3 text-xs text-muted-foreground whitespace-normal">
                                  <p>RX {formatBytes(container.network.rxBytes)}</p>
                                  <p>TX {formatBytes(container.network.txBytes)}</p>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              ) : null}
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
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
                Source
              </p>
              <div className="flex min-w-0 items-start gap-2 text-sm font-medium leading-snug">
                <Github className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 space-y-1">
                  <p className="min-w-0 break-all text-foreground">
                    {dialogRepo?.fullName ?? "-"}
                  </p>
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3.5 w-3.5" />
                    {sourceRef}
                  </p>
                </div>
              </div>
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="env-vars">Environment Variables</Label>
              <textarea
                id="env-vars"
                value={envVars}
                onChange={(event) => setEnvVars(event.target.value)}
                placeholder={"DB_DSN=postgres://task:task@postgres:5432/task?sslmode=disable\nREDIS_ADDR=redis:6379\nAPI_PORT=8080"}
                className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Optional. One `KEY=VALUE` pair per line. Deploy-managed keys are reserved.
              </p>
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

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open && isDeletingApp === null) {
            setPendingDeleteDeployment(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-lg border-border/80 bg-background/95 p-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl">Delete deployment</DialogTitle>
            <DialogDescription>
              This removes the app stack from the server and deletes its deployment folder.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border/80 bg-muted/30 p-3">
              <p className="font-medium text-foreground">{pendingDeleteDeployment?.appSlug ?? "-"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pendingDeleteDeployment
                  ? `${pendingDeleteDeployment.containers.length} container${pendingDeleteDeployment.containers.length === 1 ? "" : "s"} will be removed.`
                  : ""}
              </p>
            </div>

            <p className="text-muted-foreground">
              Use this only when you want to undeploy the app completely.
            </p>
          </div>

          <DialogFooter className="mt-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={isDeletingApp !== null}
              onClick={() => {
                setIsDeleteDialogOpen(false);
                if (isDeletingApp === null) {
                  setPendingDeleteDeployment(null);
                }
              }}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              className="min-w-28"
              disabled={!pendingDeleteDeployment || isDeletingApp !== null}
              onClick={() => {
                if (!pendingDeleteDeployment) {
                  return;
                }

                setIsDeleteDialogOpen(false);
                void deleteDeployment(pendingDeleteDeployment.appSlug);
                setPendingDeleteDeployment(null);
              }}
            >
              {isDeletingApp ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
