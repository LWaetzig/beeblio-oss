export type LocalServerName = "drizzle-kit" | "next" | "eve";

export interface LocalServerOptions {
  /** Repository root that holds node_modules, .env.local, and .beeblio/. */
  root: string;
  /** `dev` runs the hot-reloading servers; `start` serves the production builds. */
  mode?: "dev" | "start";
  uiPort?: number;
  agentPort?: number;
  /** Node.js 24 executable that runs the servers. Defaults to the current process. */
  nodePath?: string;
  /** Receives server output; without it, output goes to this process's stdio. */
  onOutput?: (name: LocalServerName, chunk: Buffer) => void;
  /** Called when a server exits or fails to spawn before `stop()` was called. */
  onExit?: (name: LocalServerName, code: number | NodeJS.Signals | null, error?: Error) => void;
}

export interface LocalServers {
  uiUrl: string;
  agentUrl: string;
  dataDir: string;
  /** Setup problems that do not stop the servers, such as a missing Git Bash on Windows. */
  warnings: string[];
  waitUntilReady(options?: { timeoutMs?: number }): Promise<void>;
  stop(): Promise<void>;
}

export function startLocalServers(options: LocalServerOptions): Promise<LocalServers>;

/** Commands to run before `mode: "start"` can serve production builds. */
export function missingProductionBuilds(root: string): string[];
