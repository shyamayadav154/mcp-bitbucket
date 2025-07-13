#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BITBUCKET_USERNAME = process.env.BITBUCKET_USERNAME;
const BITBUCKET_PASSWORD = process.env.BITBUCKET_PASSWORD;
const BITBUCKET_URL = process.env.BITBUCKET_URL;

// Validate required environment variables
if (!BITBUCKET_USERNAME) {
  throw new Error("BITBUCKET_USERNAME environment variable is required");
}

if (!BITBUCKET_PASSWORD) {
  throw new Error("BITBUCKET_PASSWORD environment variable is required");
}

if (!BITBUCKET_URL) {
  throw new Error("BITBUCKET_URL environment variable is required");
}

const WORKSPACE_AND_REPO_PATH = BITBUCKET_URL.replace(
  "https://bitbucket.org/",
  "",
);

// Create server instance
const server = new McpServer({
  name: "mcp-bitbucket",
  version: "0.0.1",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register pull requests listing tool
server.tool(
  "list_pull_requests",
  "List pull requests from a Bitbucket repository with filtering and pagination support",
  {
    state: z
      .enum(["OPEN", "MERGED", "DECLINED"])
      .optional()
      .describe("Filter PRs by state (defaults to OPEN)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of PRs to return (defaults to 50)"),
    page: z
      .number()
      .min(1)
      .optional()
      .describe("Page number for pagination (defaults to 1)"),
    target_branch: z
      .string()
      .optional()
      .describe("Filter PRs by target/destination branch name"),
  },
  async ({ state, limit, page, target_branch }) => {
    const prState = state || "OPEN";
    const prLimit = limit || 50;
    const pageNum = page || 1;

    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");

      let url = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests?state=${prState}&pagelen=${prLimit}&page=${pageNum}`;

      if (target_branch) {
        url += `&q=destination.branch.name="${target_branch}"`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Bitbucket API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const pullRequests = data.values.map((pr: any) => ({
        id: pr.id,
        title: pr.title,
        description: pr.description,
        state: pr.state,
        author: pr.author.display_name,
        created_on: pr.created_on,
        updated_on: pr.updated_on,
        source_branch: pr.source.branch.name,
        destination_branch: pr.destination.branch.name,
        links: {
          html: pr.links.html.href,
        },
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_count: data.size,
                page: pageNum,
                page_length: prLimit,
                next: data.next || null,
                previous: data.previous || null,
                pull_requests: pullRequests,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching pull requests: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register PR with diff tool (by source branch or PR ID)
server.tool(
  "get_pr_details",
  "Get pull request details with individual commit messages and their diffs by source branch name or PR ID",
  {
    source_branch: z
      .string()
      .optional()
      .describe("Source branch name to find the PR"),
    pr_id: z.number().optional().describe("Pull request ID"),
    include_diff: z
      .boolean()
      .optional()
      .describe("Whether to include commit diffs in the response (defaults to false)"),
  },
  async ({ source_branch, pr_id, include_diff }) => {
    // Validate that either source_branch or pr_id is provided
    if (!source_branch && !pr_id) {
      return {
        content: [
          {
            type: "text",
            text: "Either source_branch or pr_id must be provided",
          },
        ],
        isError: true,
      };
    }

    const shouldIncludeDiff = include_diff === true; // defaults to false

    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");
      let pr: any;

      if (pr_id) {
        // Get PR directly by ID
        const prUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests/${pr_id}`;

        const prResponse = await fetch(prUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        });

        if (!prResponse.ok) {
          throw new Error(
            `Bitbucket API error: ${prResponse.status} ${prResponse.statusText}`,
          );
        }

        pr = await prResponse.json();
      } else {
        // Find the PR by source branch
        const searchUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests?q=source.branch.name="${source_branch}"`;

        const searchResponse = await fetch(searchUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        });

        if (!searchResponse.ok) {
          throw new Error(
            `Bitbucket API error: ${searchResponse.status} ${searchResponse.statusText}`,
          );
        }

        const searchData = await searchResponse.json();

        if (searchData.values.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No pull request found for source branch: ${source_branch}`,
              },
            ],
          };
        }

        pr = searchData.values[0]; // Get the first matching PR
      }

      // Get commits for this PR
      const commitsUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests/${pr.id}/commits`;

      const commitsResponse = await fetch(commitsUrl, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      let commits: any[] = [];
      if (commitsResponse.ok) {
        const commitsData = await commitsResponse.json();

        // Get diff for each commit if requested
        for (const commit of commitsData.values) {
          let diff = null;
          
          if (shouldIncludeDiff) {
            const commitDiffUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/diff/${commit.hash}`;

            try {
              const commitDiffResponse = await fetch(commitDiffUrl, {
                headers: {
                  Authorization: `Basic ${auth}`,
                  Accept: "text/plain",
                },
              });

              if (commitDiffResponse.ok) {
                diff = await commitDiffResponse.text();
              } else {
                diff = `Error fetching diff: ${commitDiffResponse.status} ${commitDiffResponse.statusText}`;
              }
            } catch (error) {
              diff = `Error fetching diff: ${error instanceof Error ? error.message : String(error)}`;
            }
          }

          const commitData: any = {
            hash: commit.hash,
            message: commit.message,
            author: commit.author.user?.display_name || commit.author.raw,
            date: commit.date,
          };

          if (shouldIncludeDiff) {
            commitData.diff = diff;
          }

          commits.push(commitData);
        }
      } else {
        commits = [
          `Error fetching commits: ${commitsResponse.status} ${commitsResponse.statusText}`,
        ];
      }

      const prDetails = {
        id: pr.id,
        title: pr.title,
        // description: pr.description,
        state: pr.state,
        author: pr.author.display_name,
        created_on: pr.created_on,
        updated_on: pr.updated_on,
        source_branch: pr.source.branch.name,
        destination_branch: pr.destination.branch.name,
        links: {
          html: pr.links.html.href,
        },
        reviewers:
          pr.reviewers?.map((reviewer: any) => ({
            display_name: reviewer.display_name,
            approved: reviewer.approved,
          })) || [],
        commits: commits,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                search_method: pr_id
                  ? `pr_id: ${pr_id}`
                  : `source_branch: ${source_branch}`,
                pull_request: prDetails,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching PR with diff: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register add comment to PR tool
server.tool(
  "add_pr_comment",
  "Add a general comment to a pull request",
  {
    pr_id: z.number().describe("Pull request ID"),
    content: z.string().describe("Comment content"),
  },
  async ({ pr_id, content }) => {
    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");
      const url = `https://api.bitbucket.org/2.0/repositories/${BITBUCKET_URL.replace("https://bitbucket.org/", "")}/pullrequests/${pr_id}/comments`;

      const commentData = {
        content: {
          raw: content,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commentData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Bitbucket API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const responseData = await response.json();

      const commentDetails = {
        id: responseData.id,
        content: responseData.content.raw,
        author: responseData.user.display_name,
        created_on: responseData.created_on,
        type: responseData.type,
        links: {
          html: responseData.links?.html?.href,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pull_request_id: pr_id,
                message: "Comment added successfully to pull request",
                comment: commentDetails,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error adding PR comment: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register list pipelines tool
server.tool(
  "list_pipelines",
  "List pipelines from a Bitbucket repository with filtering and pagination support",
  {
    state: z
      .enum([
        "IN_PROGRESS",
        "SUCCESSFUL",
        "FAILED",
        "STOPPED",
        "SKIPPED",
        "PENDING",
        "ERROR",
      ])
      .optional()
      .describe("Filter pipelines by state"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of pipelines to return (defaults to 10)"),
    page: z
      .number()
      .min(1)
      .optional()
      .describe("Page number for pagination (defaults to 1)"),
    target_branch: z
      .string()
      .optional()
      .describe("Filter pipelines by target branch name"),
  },
  async ({ state, limit, page, target_branch }) => {
    const pipelineLimit = limit || 10;
    const pageNum = page || 1;
    const sortOrder = "-created_on";

    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");

      let url = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pipelines/?pagelen=${pipelineLimit}&page=${pageNum}&sort=${sortOrder}`;

      if (state) {
        url += `&state=${state}`;
      }

      if (target_branch) {
        url += `&target.ref_name=${target_branch}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Bitbucket API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const pipelines = await Promise.all(
        data.values.map(async (pipeline: any) => {
          let commitMessage = pipeline.target?.commit?.message;

          // If commit message is not available, fetch it using the commit hash
          if (!commitMessage && pipeline.target?.commit?.hash) {
            try {
              const commitUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/commit/${pipeline.target.commit.hash}`;
              const commitResponse = await fetch(commitUrl, {
                headers: {
                  Authorization: `Basic ${auth}`,
                  Accept: "application/json",
                },
              });

              if (commitResponse.ok) {
                const commitData = await commitResponse.json();
                commitMessage = commitData.message;
                // Update the target commit message
                if (pipeline.target && pipeline.target.commit) {
                  pipeline.target.commit.message = commitMessage;
                }
              }
            } catch (error) {
              // Ignore errors fetching commit details
            }
          }

          // Extract PR ID from commit message if it follows the format #pr_id
          const prIdMatch = commitMessage?.match(/#(\d+)/);
          const pr_id = prIdMatch ? parseInt(prIdMatch[1]) : null;

          return {
            pr_id: pr_id,
            // uuid: pipeline.uuid,
            // build_number: pipeline.build_number,
            state: pipeline.state,
            created_on: pipeline.created_on,
            completed_on: pipeline.completed_on,
            run_number: pipeline.run_number,
            duration_in_seconds: pipeline.duration_in_seconds,
            target: pipeline.target,
            // trigger: pipeline.trigger,
            // links: pipeline.links,
          };
        }),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_count: data.size,
                page: pageNum,
                page_length: pipelineLimit,
                next: data.next || null,
                previous: data.previous || null,
                pipelines: pipelines,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching pipelines: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Bitbucket server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
