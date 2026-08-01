import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { errMessage } from "../util/errors.ts";

export class CodexRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexRpcError";
  }
}

type JsonRpcId = number | string;
type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

export interface CodexAppServerOptions {
  binaryPath: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  onNotification(method: string, params: unknown): void | Promise<void>;
  onRequest(method: string, params: unknown): Promise<unknown>;
}

export class CodexAppServer {
  readonly process: ChildProcess;
  private readonly options: CodexAppServerOptions;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, { resolve(value: unknown): void; reject(error: Error): void }>();
  private writeTail = Promise.resolve();
  private eventTail = Promise.resolve();
  private stderr = "";
  private closed = false;
  private closeError: Error | null = null;
  private readonly processClosed: Promise<void>;

  constructor(options: CodexAppServerOptions) {
    this.options = options;
    this.process = spawn(options.binaryPath, ["app-server"], {
      cwd: options.cwd,
      ...(options.env ? { env: options.env } : {}),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let resolveProcessClosed!: () => void;
    this.processClosed = new Promise<void>((resolve) => {
      resolveProcessClosed = resolve;
    });
    const lines = createInterface({ input: this.process.stdout! });
    lines.on("line", (line) => {
      this.eventTail = this.eventTail
        .then(() => this.receive(line))
        .catch((error) => {
          this.failAll(error instanceof Error ? error : new Error(String(error)));
          this.process.kill("SIGTERM");
        });
    });
    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-16_384);
    });
    this.process.once("error", (error) => {
      this.closed = true;
      this.closeError = error;
      this.failAll(error);
      resolveProcessClosed();
    });
    this.process.once("close", (code, signal) => {
      this.closed = true;
      this.closeError = new Error(
        `Codex app-server exited (${code ?? signal ?? "unknown"})${this.stderr.trim() ? `: ${this.stderr.trim()}` : ""}`,
      );
      this.failAll(this.closeError);
      resolveProcessClosed();
    });
  }

  error(): Error | null {
    return this.closeError;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "qm", title: "QM", version: "1" },
      capabilities: { experimentalApi: true },
    });
    await this.notify("initialized");
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error("Codex app-server is closed"));
    const id = this.nextId++;
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
    void this.send({ id, method, ...(params === undefined ? {} : { params }) }).catch((error) => {
      const waiter = this.pending.get(id);
      this.pending.delete(id);
      waiter?.reject(error instanceof Error ? error : new Error(String(error)));
    });
    return result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.send({ method, ...(params === undefined ? {} : { params }) });
  }

  async close(): Promise<void> {
    if (this.closed) return await this.processClosed;
    this.closed = true;
    this.process.kill("SIGTERM");
    const timer = setTimeout(() => this.process.kill("SIGKILL"), 2_000);
    await this.processClosed;
    clearTimeout(timer);
  }

  private async receive(line: string): Promise<void> {
    if (!line.trim()) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      throw new Error(`Codex app-server emitted invalid JSON: ${line.slice(0, 500)}`);
    }
    if (message.id !== undefined && !message.method) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error)
        waiter.reject(
          new CodexRpcError(
            `Codex ${message.error.code ?? "error"}: ${message.error.message ?? JSON.stringify(message.error.data)}`,
          ),
        );
      else waiter.resolve(message.result);
      return;
    }
    if (!message.method) return;
    if (message.id === undefined) {
      await this.options.onNotification(message.method, message.params);
      return;
    }
    try {
      const result = await this.options.onRequest(message.method, message.params);
      await this.send({ id: message.id, result });
    } catch (error) {
      await this.send({ id: message.id, error: { code: -32000, message: errMessage(error) } });
    }
  }

  private send(message: JsonRpcMessage): Promise<void> {
    const line = `${JSON.stringify(message)}\n`;
    const operation = this.writeTail.then(async () => {
      if (this.closed || !this.process.stdin?.writable) throw new Error("Codex app-server stdin is closed");
      await new Promise<void>((resolve, reject) => {
        this.process.stdin!.write(line, (error) => (error ? reject(error) : resolve()));
      });
    });
    this.writeTail = operation.catch(() => undefined);
    return operation;
  }

  private failAll(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}
