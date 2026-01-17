/**
 * Permissions utility for managing destructive operation confirmations
 * Used by both CLI and TUI
 */
export class Permissions {
  private static requireConfirmations: boolean = true;
  private static approvedCommands: Set<string> = new Set();

  static setRequireConfirmations(value: boolean): void {
    Permissions.requireConfirmations = value;
  }

  static getRequireConfirmations(): boolean {
    return Permissions.requireConfirmations;
  }

  static approveCommand(command: string): void {
    Permissions.approvedCommands.add(command);
  }

  static isApproved(command: string): boolean {
    return Permissions.approvedCommands.has(command);
  }

  static clearApprovals(): void {
    Permissions.approvedCommands.clear();
  }

  private static DESTRUCTIVE_PATTERNS = [
    /^rm\s/,
    /^rm\s+-rf/,
    /^rmdir\s/,
    /^mv\s/,
    /^dd\s/,
    /^shred\s/,
    /^mkfs\s/,
    />\s*\//, // redirect to root paths
  ];

  static isDestructive(command: string): boolean {
    return Permissions.DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(command));
  }
}
