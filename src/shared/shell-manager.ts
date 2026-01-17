import { Subprocess } from "bun";

export interface BackgroundShell {
  id: string;
  command: string;
  process: Subprocess;
  startedAt: Date;
  stdout: string[];
  stderr: string[];
}

export class ShellManager {
  private shells = new Map<string, BackgroundShell>();
  private counter = 0;

  spawn(command: string): string {
    const id = `bash_${++this.counter}`;

    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });

    const shell: BackgroundShell = {
      id,
      command,
      process: proc,
      startedAt: new Date(),
      stdout: [],
      stderr: [],
    };

    this.shells.set(id, shell);

    this.captureOutput(shell);

    return id;
  }

  private async captureOutput(shell: BackgroundShell) {
    const readStream = async (
      stream: ReadableStream<Uint8Array>,
      buffer: string[]
    ) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.length > 0);
          buffer.push(...lines);
          // Keep only last 1000 lines
          if (buffer.length > 1000) {
            buffer.splice(0, buffer.length - 1000);
          }
        }
      } catch {
        // Stream closed
      }
    };

    if (shell.process.stdout) {
      readStream(shell.process.stdout as ReadableStream<Uint8Array>, shell.stdout);
    }
    if (shell.process.stderr) {
      readStream(shell.process.stderr as ReadableStream<Uint8Array>, shell.stderr);
    }
  }

  list(): Array<{
    id: string;
    command: string;
    running: boolean;
    pid: number;
    runtime: string;
    exitCode: number | null;
  }> {
    const results = [];
    for (const shell of this.shells.values()) {
      const running = shell.process.exitCode === null;
      const runtime = this.formatRuntime(shell.startedAt);
      results.push({
        id: shell.id,
        command: shell.command.length > 40 
          ? shell.command.slice(0, 37) + "..." 
          : shell.command,
        running,
        pid: shell.process.pid,
        runtime,
        exitCode: shell.process.exitCode,
      });
    }
    return results;
  }

  private formatRuntime(startedAt: Date): string {
    const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  getOutput(id: string, lines = 20): { stdout: string[]; stderr: string[] } | null {
    const shell = this.shells.get(id);
    if (!shell) return null;

    return {
      stdout: shell.stdout.slice(-lines),
      stderr: shell.stderr.slice(-lines),
    };
  }

  isRunning(id: string): boolean | null {
    const shell = this.shells.get(id);
    if (!shell) return null;
    return shell.process.exitCode === null;
  }

  kill(id: string): boolean {
    const shell = this.shells.get(id);
    if (!shell) return false;

    if (shell.process.exitCode === null) {
      shell.process.kill();
    }
    return true;
  }

  killAll(): number {
    let killed = 0;
    for (const shell of this.shells.values()) {
      if (shell.process.exitCode === null) {
        shell.process.kill();
        killed++;
      }
    }
    return killed;
  }

  remove(id: string): boolean {
    const shell = this.shells.get(id);
    if (!shell) return false;

    if (shell.process.exitCode === null) {
      shell.process.kill();
    }
    this.shells.delete(id);
    return true;
  }

  clear(): number {
    const count = this.shells.size;
    this.killAll();
    this.shells.clear();
    return count;
  }
}

export const shellManager = new ShellManager();
