import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../shared/config";
import type { CanonicalMessage } from "./llm/types";

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  variant: string;
  modelId: string;
}

export interface Session extends SessionMetadata {
  conversation: CanonicalMessage[];
}

function getSessionsDir(): string {
  const dir = join(getConfigDir(), "sessions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractTitle(conversation: CanonicalMessage[]): string {
  const firstUserMessage = conversation.find((m) => m.role === "user" && m.content);
  if (firstUserMessage?.content) {
    const title = firstUserMessage.content.slice(0, 50);
    return title.length < firstUserMessage.content.length ? title + "..." : title;
  }
  return "Untitled Session";
}

export function saveSession(
  conversation: CanonicalMessage[],
  options: {
    id?: string;
    title?: string;
    variant?: string;
    modelId?: string;
  } = {}
): Session {
  const sessionsDir = getSessionsDir();
  const now = new Date().toISOString();
  
  const id = options.id || generateId();
  const title = options.title || extractTitle(conversation);
  
  // Check if session exists (for updating)
  const filePath = join(sessionsDir, `${id}.json`);
  let createdAt = now;
  
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, "utf-8")) as Session;
      createdAt = existing.createdAt;
    } catch {
      // ignore
    }
  }
  
  const session: Session = {
    id,
    title,
    createdAt,
    updatedAt: now,
    variant: options.variant || "default",
    modelId: options.modelId || "glm/glm-4.7",
    conversation,
  };
  
  writeFileSync(filePath, JSON.stringify(session, null, 2));
  
  return session;
}

export function loadSession(id: string): Session | null {
  const sessionsDir = getSessionsDir();
  const filePath = join(sessionsDir, `${id}.json`);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Session;
  } catch {
    return null;
  }
}

export function listSessions(): SessionMetadata[] {
  const sessionsDir = getSessionsDir();
  const sessions: SessionMetadata[] = [];
  
  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    
    for (const file of files) {
      try {
        const content = readFileSync(join(sessionsDir, file), "utf-8");
        const session = JSON.parse(content) as Session;
        sessions.push({
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          variant: session.variant,
          modelId: session.modelId,
        });
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Sessions dir doesn't exist yet
  }
  
  // Sort by updatedAt descending (most recent first)
  sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  
  return sessions;
}

export function deleteSession(id: string): boolean {
  const sessionsDir = getSessionsDir();
  const filePath = join(sessionsDir, `${id}.json`);
  
  if (!existsSync(filePath)) {
    return false;
  }
  
  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function clearOldSessions(keepCount: number = 50): number {
  const sessions = listSessions();
  let deleted = 0;
  
  if (sessions.length > keepCount) {
    const toDelete = sessions.slice(keepCount);
    for (const session of toDelete) {
      if (deleteSession(session.id)) {
        deleted++;
      }
    }
  }
  
  return deleted;
}
