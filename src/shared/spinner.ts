const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CYBER_FRAMES = ["▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰", "▱▰▰▰▰", "▱▱▰▰▰", "▱▱▱▰▰", "▱▱▱▱▰", "▱▱▱▱▱"];

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private message: string;

  constructor(message = "Thinking") {
    this.message = message;
  }

  start() {
    this.frameIndex = 0;
    process.stdout.write("\x1B[?25l"); // Hide cursor
    this.render();
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % CYBER_FRAMES.length;
      this.render();
    }, 80);
  }

  private render() {
    const frame = CYBER_FRAMES[this.frameIndex];
    process.stdout.write(`\r\x1B[36m${frame}\x1B[0m ${this.message}...`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write("\r\x1B[K"); // Clear line
    process.stdout.write("\x1B[?25h"); // Show cursor
  }
}
