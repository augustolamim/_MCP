import { config } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';

config();

const token = process.env.GITHUB_TOKEN;

if (!token) {
  // Fail fast so the container exits noisily when misconfigured.
  throw new Error('Missing GITHUB_TOKEN env var. Provide a personal access token with repo scope.');
}

const octokit = new Octokit({ auth: token });

const server = new McpServer({
  name: 'github-mcp',
  version: '0.1.0',
});

const repoInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  private: z.boolean().default(true),
  org: z.string().optional(),
});

server.tool(
  'create_repository',
  {
    description: 'Create a GitHub repository under the authenticated user or a specified org.',
    inputSchema: repoInput,
  },
  async ({ input }) => {
    const { name, description, private: isPrivate, org } = input;

    const repoParams = {
      name,
      description,
      private: isPrivate,
    };

    const response = org
      ? await octokit.repos.createInOrg({ org, ...repoParams })
      : await octokit.repos.createForAuthenticatedUser(repoParams);

    return {
      repo: response.data.full_name,
      url: response.data.html_url,
      defaultBranch: response.data.default_branch,
    };
  }
);

const fileInput = z.object({
  owner: z.string().optional(),
  repo: z.string(),
  path: z.string(),
  message: z.string().default('Automated commit from MCP server'),
  content: z.string(),
  branch: z.string().default('main'),
  encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
});

server.tool(
  'upsert_file',
  {
    description:
      'Create or update a file in a GitHub repo. Will create intermediate folders if needed. Commits directly to the specified branch.',
    inputSchema: fileInput,
  },
  async ({ input }) => {
    const owner = input.owner ?? (await currentLogin());
    const contentBuffer =
      input.encoding === 'base64'
        ? Buffer.from(input.content, 'base64')
        : Buffer.from(input.content, 'utf-8');

    // Attempt to fetch the file to preserve history.
    let sha: string | undefined;
    try {
      const existing = await octokit.repos.getContent({
        owner,
        repo: input.repo,
        path: input.path,
        ref: input.branch,
      });
      if (!Array.isArray(existing.data) && existing.data.sha) {
        sha = existing.data.sha;
      }
    } catch (error: unknown) {
      // 404 is expected when creating a new file; anything else should surface.
      if (!(error as { status?: number }).status || (error as { status?: number }).status !== 404) {
        throw error;
      }
    }

    const response = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: input.repo,
      path: input.path,
      message: input.message,
      content: contentBuffer.toString('base64'),
      branch: input.branch,
      sha,
    });

    return {
      commitSha: response.data.commit.sha,
      downloadUrl: response.data.content?.download_url ?? null,
      htmlUrl: response.data.content?.html_url ?? null,
    };
  }
);

const branchInput = z.object({
  owner: z.string().optional(),
  repo: z.string(),
  from: z.string().default('main'),
  to: z.string(),
});

server.tool(
  'create_branch',
  {
    description: 'Create a new branch from an existing reference.',
    inputSchema: branchInput,
  },
  async ({ input }) => {
    const owner = input.owner ?? (await currentLogin());
    const baseRef = await octokit.git.getRef({
      owner,
      repo: input.repo,
      ref: `heads/${input.from}`,
    });

    const newRef = await octokit.git.createRef({
      owner,
      repo: input.repo,
      ref: `refs/heads/${input.to}`,
      sha: baseRef.data.object.sha,
    });

    return {
      branch: input.to,
      sha: newRef.data.object.sha,
    };
  }
);

server.tool(
  'whoami',
  {
    description: 'Return the authenticated GitHub user.',
    inputSchema: z.object({}),
  },
  async () => {
    const user = await octokit.users.getAuthenticated();
    return {
      login: user.data.login,
      name: user.data.name,
      plan: user.data.plan?.name ?? 'unknown',
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

async function currentLogin(): Promise<string> {
  const user = await octokit.users.getAuthenticated();
  return user.data.login;
}
