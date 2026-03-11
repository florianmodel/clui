import { DockerManager } from './DockerManager.js';

export class DockerHealthMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private lastStatus: boolean | null = null;
  private docker: DockerManager;

  constructor() {
    this.docker = new DockerManager();
  }

  start(onStatusChange: (running: boolean, version?: string) => void): void {
    const check = async () => {
      try {
        const res = await this.docker.checkHealth();
        const running = res.ok;
        if (running !== this.lastStatus) {
          this.lastStatus = running;
          onStatusChange(running, res.version);
        }
      } catch {
        if (this.lastStatus !== false) {
          this.lastStatus = false;
          onStatusChange(false);
        }
      }
    };

    check();
    this.intervalId = setInterval(check, 10_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
