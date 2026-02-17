"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  GitBranch,
  Github,
  Lock,
  Search,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SourceRepo = {
  name: string;
  owner: string;
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

export function DashboardClient() {
  const [repos, setRepos] = useState<SourceRepo[]>([]);
  const [githubLogin, setGithubLogin] = useState<string>("github-user");
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportingRepo, setIsImportingRepo] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DeployFeedback | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogRepo, setDialogRepo] = useState<SourceRepo | null>(null);
  const [projectName, setProjectName] = useState("");
  const [sourceRef, setSourceRef] = useState("main");
  const [internalPort, setInternalPort] = useState("3000");
  const [team, setTeam] = useState("personal");

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

  const owners = useMemo(() => {
    return [...new Set(repos.map((repo) => repo.owner))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return repos.filter((repo) => {
      if (selectedOwner !== "all" && repo.owner !== selectedOwner) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        repo.name.toLowerCase().includes(query) ||
        repo.fullName.toLowerCase().includes(query)
      );
    });
  }, [repos, searchTerm, selectedOwner]);

  const openImportDialog = (repo: SourceRepo) => {
    setDialogRepo(repo);
    setProjectName(repo.name);
    setSourceRef(repo.defaultBranch || "main");
    setInternalPort("3000");
    setTeam("personal");
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
          sourceOwner: dialogRepo.owner,
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
      <main className="flex h-[calc(100vh-65px)] items-stretch justify-center p-4">
        <Card className="flex h-full w-full max-w-4xl flex-col border-border/80 bg-card/95 backdrop-blur-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-3xl font-semibold tracking-tight">
              Import Git Repository
            </CardTitle>
            <CardDescription>
              Pick a repository and import it to build and deploy automatically.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            {feedback && (
              <Alert variant={feedback.status === "error" ? "destructive" : "default"}>
                <AlertTitle>{feedback.title}</AlertTitle>
                <AlertDescription className="break-all">{feedback.detail}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner} value={owner}>
                      {owner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search repositories..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/80">
              {isLoadingRepos ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Loading repositories...
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="space-y-1 px-4 py-6 text-sm text-muted-foreground">
                  <p>No repositories found.</p>
                  <p className="text-xs">
                    Ensure GitHub OAuth scopes include `repo` and `read:org`, then sign
                    out and sign in again.
                  </p>
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <div
                    key={repo.fullName}
                    className="flex items-center justify-between border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="truncate text-xl font-medium text-card-foreground">
                        {repo.name}
                        {repo.private ? (
                          <Lock className="ml-2 inline h-4 w-4 text-muted-foreground" />
                        ) : null}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {formatRepoDate(repo.pushedAt)}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {repo.fullName}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-10 px-5"
                      disabled={isImportingRepo === repo.fullName}
                      onClick={() => openImportDialog(repo)}
                    >
                      {isImportingRepo === repo.fullName ? "Importing..." : "Import"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl p-10">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-4xl">New Project</DialogTitle>
            <div className="rounded-lg border border-border/70 bg-muted/50 px-4 py-3">
              <DialogDescription className="mb-1 text-sm">
                Importing from GitHub
              </DialogDescription>
              <p className="flex items-center gap-3 text-xl font-medium text-foreground">
                <Github className="h-5 w-5" />
                {dialogRepo?.fullName ?? "-"}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <GitBranch className="h-4 w-4" />
                  {sourceRef}
                </span>
              </p>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <p className="text-xl text-foreground">
              Choose where you want to create the project and give it a name.
            </p>

            <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-end">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Team</Label>
                <Select value={team} onValueChange={setTeam}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">{`${githubLogin}'s projects`}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="hidden pb-2 text-muted-foreground md:block">/</p>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Project Name</Label>
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={dialogRepo?.name ?? "my-project"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Git Ref</Label>
              <Input
                value={sourceRef}
                onChange={(event) => setSourceRef(event.target.value)}
                placeholder={dialogRepo?.defaultBranch ?? "main"}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Internal Port</Label>
              <Input
                value={internalPort}
                onChange={(event) => setInternalPort(event.target.value)}
                placeholder="3000"
                inputMode="numeric"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start rounded-lg px-4 py-3 text-left text-muted-foreground"
            >
              <ChevronRight className="mr-2 h-4 w-4" />
              Build and Output Settings
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start rounded-lg px-4 py-3 text-left text-muted-foreground"
            >
              <ChevronRight className="mr-2 h-4 w-4" />
              Environment Variables
            </Button>
          </div>

          <Button
            className="h-12 w-full text-lg"
            disabled={isImportingRepo !== null}
            onClick={() => {
              void importRepo();
            }}
          >
            {isImportingRepo ? "Deploying..." : "Deploy"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
