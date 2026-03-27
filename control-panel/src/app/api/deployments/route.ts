import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const deleteDeploymentSchema = z.object({
  appSlug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(63),
});

function firstDefinedEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function splitRepository(fullRepository: string) {
  const [owner, name, ...rest] = fullRepository.split("/");

  if (!owner || !name || rest.length > 0) {
    return null;
  }

  return { owner, name };
}

export async function DELETE(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const parsed = deleteDeploymentSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid delete payload",
        detail: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const repositoryFromSingleVar = firstDefinedEnv([
    "DEPLOY_REPOSITORY",
    "GITHUB_REPOSITORY",
    "VERCEL_GIT_REPO_FULL_NAME",
  ]);
  const parsedRepository = repositoryFromSingleVar
    ? splitRepository(repositoryFromSingleVar)
    : null;

  const repoOwner =
    firstDefinedEnv([
      "DEPLOY_REPO_OWNER",
      "GITHUB_REPOSITORY_OWNER",
      "VERCEL_GIT_REPO_OWNER",
      "REPO_OWNER",
    ]) ?? parsedRepository?.owner ?? null;
  const repoName =
    firstDefinedEnv([
      "DEPLOY_REPO_NAME",
      "GITHUB_REPOSITORY_NAME",
      "VERCEL_GIT_REPO_SLUG",
      "REPO_NAME",
    ]) ?? parsedRepository?.name ?? null;
  const workflowFile = process.env.DELETE_WORKFLOW_FILE ?? "delete-app-from-ui.yml";
  const workflowRef = process.env.DELETE_WORKFLOW_REF ?? process.env.DEPLOY_WORKFLOW_REF ?? "main";
  const deployToken = firstDefinedEnv([
    "DEPLOY_GITHUB_TOKEN",
    "GITHUB_TOKEN",
    "GH_TOKEN",
  ]);

  if (!repoOwner || !repoName || !deployToken) {
    const missing = [
      !repoOwner ? "DEPLOY_REPO_OWNER" : null,
      !repoName ? "DEPLOY_REPO_NAME" : null,
      !deployToken ? "DEPLOY_GITHUB_TOKEN" : null,
    ].filter((value): value is string => Boolean(value));

    return NextResponse.json(
      {
        error:
          "Missing deploy configuration. Set DEPLOY_REPO_OWNER, DEPLOY_REPO_NAME, and DEPLOY_GITHUB_TOKEN.",
        detail: `Missing: ${missing.join(", ")}. Supported aliases: DEPLOY_REPOSITORY (owner/name), GITHUB_REPOSITORY, GITHUB_TOKEN, GH_TOKEN.`,
      },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${deployToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: workflowRef,
        inputs: {
          app_slug: parsed.data.appSlug,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      {
        error: "Failed to start delete workflow",
        detail: errorText,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "queued",
    workflowUrl: `https://github.com/${repoOwner}/${repoName}/actions/workflows/${workflowFile}`,
  });
}
