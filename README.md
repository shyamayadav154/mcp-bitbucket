# MCP Bitbucket Server

A Model Context Protocol (MCP) server that provides access to Bitbucket pull requests, allowing users to list, filter, and retrieve pull requests by state (OPEN, MERGED, DECLINED), add comments, and inspect diffs.

## Features

- **Pull Request Management**: List, filter, and retrieve pull requests by state (OPEN, MERGED, DECLINED) with pagination support
- **Comment System**: Add comments to pull requests
- **Diff Inspection**: Retrieve individual commit diffs for comprehensive code review
- **Branch/PR_ID based Search**: Find pull requests by source branch name or PR ID
- **Target Branch Filtering**: Filter pull requests by destination/target branch
- **Pipeline Management**: List and filter CI/CD pipelines by state and target branch with automatic PR ID extraction from commit messages
- **Commit Message Fetching**: Automatically retrieves commit message details when not available in pipeline response
- **Environment-based Configuration**: Configure repository via environment variables

## API

### Tools

- **list_pull_requests**
  - List pull requests from the configured Bitbucket repository
  - Input: `state` (OPEN/MERGED/DECLINED), `limit` (1-100) default 50, `page` (pagination), `target_branch` (filter by target branch)
  - Returns: Formatted list of pull requests with metadata and pagination info

- **get_pr_details**
  - Get pull request details with individual commit messages and their diffs
  - Input: `source_branch` OR `pr_id`
  - Returns: Complete pull request information with individual commit diffs

- **add_pr_comment**
  - Add a general comment to a pull request
  - Input: `pr_id`, `content`
  - Returns: Created comment details

- **list_pipelines**
  - List pipelines from the configured Bitbucket repository with commit message details
  - Input: `state` (IN_PROGRESS/SUCCESSFUL/FAILED/STOPPED/SKIPPED/PENDING/ERROR), `limit` (1-100) default 10, `page` (pagination), `target_branch` (filter by target branch)
  - Returns: Formatted list of pipelines with metadata, PR ID extracted from commit messages, commit details, and pagination info

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
