/**
 * Command history manager for session-only command recall
 * Used by both CLI and TUI
 */
export class CommandHistory {
  private history: string[] = [];
  private index: number = -1;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Add a command to history
   * Skips if empty or same as most recent
   */
  add(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) return;
    
    // Don't add duplicate of most recent
    if (this.history.length > 0 && this.history[0] === trimmed) {
      return;
    }

    this.history.unshift(trimmed);
    
    // Limit size
    if (this.history.length > this.maxSize) {
      this.history.pop();
    }
    
    // Reset navigation index
    this.index = -1;
  }

  /**
   * Navigate to previous (older) command
   * Returns the command or null if at end
   */
  getPrevious(): string | null {
    if (this.history.length === 0) return null;
    
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }
    
    return null;
  }

  /**
   * Navigate to next (newer) command
   * Returns the command, empty string for current input, or null if at start
   */
  getNext(): string | null {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    
    if (this.index === 0) {
      this.index = -1;
      return ""; // Return to empty (current input)
    }
    
    return null;
  }

  /**
   * Reset navigation index
   * Call when user starts typing new content
   */
  reset(): void {
    this.index = -1;
  }

  /**
   * Get current navigation position
   */
  getIndex(): number {
    return this.index;
  }

  /**
   * Get total history length
   */
  getLength(): number {
    return this.history.length;
  }

  /**
   * Get all history items
   */
  getAll(): string[] {
    return [...this.history];
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.index = -1;
  }
}
