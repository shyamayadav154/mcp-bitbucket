# MCP Bitbucket Server

A Model Context Protocol (MCP) server that provides access to Bitbucket pull requests, allowing users to list, filter, and retrieve pull requests by state (OPEN, MERGED, DECLINED), add comments, and inspect diffs.

## Features

- **Pull Request Management**: List, filter, and retrieve pull requests by state (OPEN, MERGED, DECLINED)
- **Comment System**: Get and add comments to pull requests
- **Diff Inspection**: Retrieve pull request diffs for code review
- **Branch/PR_ID based Search**: Find pull requests by source branch name or PR ID
- **Environment-based Configuration**: Configure repository via environment variables

## API

### Tools

- **list_pull_requests**
  - List pull requests from the configured Bitbucket repository
  - Input: `state` (OPEN/MERGED/DECLINED), `limit` (1-50) default 50
  - Returns: Formatted list of pull requests with metadata

- **get_pr_comments**
  - Get comments from a specific pull request
  - Input: `pr_id`, `limit` (1-100) default 50
  - Returns: All comments including inline code comments

- **get_pr_with_diff**
  - Get pull request details with diff content
  - Input: `source_branch` OR `pr_id`, `include_diff` (boolean)
  - Returns: Complete pull request information with diff

- **add_pr_comment**
  - Add a general comment to a pull request
  - Input: `pr_id`, `content`
  - Returns: Created comment details

## Prerequisites

- Node.js (version 18.x or higher)
- Bitbucket Cloud account
- Bitbucket App Password with appropriate permissions

## Setup

### 1. Generate Bitbucket App Password

Generate one from [Bitbucket App Passwords](https://bitbucket.org/account/settings/app-passwords/). Minimum permissions:

- Workspaces: Read
- Repositories: Read
- Pull Requests: Read, Write (if you want to add comments)

## Usage

#### MCP Server Configuration

```json
{
  "mcpServers": {
    "mcp-bitbucket": {
      "command": "npx",
      "args": ["mcp-bitbucket"],
      "env": {
        "BITBUCKET_USERNAME": "<your_username>",
        "BITBUCKET_PASSWORD": "<your_app_password>",
        "BITBUCKET_URL": "https://bitbucket.org/<workspace>/<repo_name>"
      }
    }
  }
}
```

## Use Case

- Review the PR diff and add that as a comment

## Security Note

This server uses Bitbucket App Passwords for authentication. Create an App Password in your Bitbucket settings with appropriate permissions for repositories and pull requests.

## License

MIT
