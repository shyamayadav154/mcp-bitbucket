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

const WORKSPACE_AND_REPO_PATH = BITBUCKET_URL.replace('https://bitbucket.org/', '');


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
  "List pull requests from a Bitbucket repository",
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
  },
  async ({ state, limit }) => {
    const prState = state || "OPEN";
    const prLimit = limit || 50;

    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");
      const url = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests?state=${prState}&pagelen=${prLimit}`;

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

// Register PR comments listing tool
server.tool(
  "get_pr_comments",
  "Get comments from a specific pull request",
  {
    pr_id: z.number().describe("Pull request ID"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of comments to return (defaults to 50)"),
  },
  async ({ pr_id, limit }) => {
    const commentLimit = limit || 50;

    try {
      const auth = Buffer.from(
        `${BITBUCKET_USERNAME}:${BITBUCKET_PASSWORD}`,
      ).toString("base64");
      const url = `https://api.bitbucket.org/2.0/repositories/${BITBUCKET_URL.replace("https://bitbucket.org/", "")}/pullrequests/${pr_id}/comments?pagelen=${commentLimit}`;

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
      const comments = data.values.map((comment: any) => ({
        id: comment.id,
        content: comment.content.raw,
        author: comment.user.display_name,
        created_on: comment.created_on,
        updated_on: comment.updated_on,
        type: comment.type,
        inline: comment.inline
          ? {
              from: comment.inline.from,
              to: comment.inline.to,
              path: comment.inline.path,
            }
          : null,
        links: {
          html: comment.links?.html?.href,
        },
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                pull_request_id: pr_id,
                total_count: data.size,
                comments: comments,
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
            text: `Error fetching PR comments: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// Register PR with diff tool (by source branch or PR ID)
server.tool(
  "get_pr_with_diff",
  "Get pull request details with diff by source branch name or PR ID",
  {
    source_branch: z
      .string()
      .optional()
      .describe("Source branch name to find the PR"),
    pr_id: z.number().optional().describe("Pull request ID"),
    include_diff: z
      .boolean()
      .optional()
      .describe("Include diff content (defaults to true)"),
  },
  async ({ source_branch, pr_id, include_diff }) => {
    const includeDiff = include_diff !== false;

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

      let diffContent = null;
      if (includeDiff) {
        // Get the diff for this PR
        const diffUrl = `https://api.bitbucket.org/2.0/repositories/${WORKSPACE_AND_REPO_PATH}/pullrequests/${pr.id}/diff`;

        const diffResponse = await fetch(diffUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "text/plain",
          },
          redirect: "follow",
        });

        if (diffResponse.ok) {
          diffContent = await diffResponse.text();
        } else {
          diffContent = `Error fetching diff: ${diffResponse.status} ${diffResponse.statusText}`;
        }
      }

      const prDetails = {
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
        reviewers:
          pr.reviewers?.map((reviewer: any) => ({
            display_name: reviewer.display_name,
            approved: reviewer.approved,
          })) || [],
        diff: diffContent,
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
