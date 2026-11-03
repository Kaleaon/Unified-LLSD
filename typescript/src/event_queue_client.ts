import { CapabilityClient, EventQueueEvent, EventQueuePollResult } from './capability_client.js';

export class EventQueueClient {
  public queueUrl: string | null = null;
  public ackId: number | null = null;
  public isPolling: boolean = false;
  public baseDelay: number = 1000;
  public maxDelay: number = 30000;
  public currentDelay: number = 1000;

  private capClient: CapabilityClient;
  private timerId: any = null;
  private listeners: Array<(event: EventQueueEvent) => void> = [];

  constructor(capClient?: CapabilityClient) {
    this.capClient = capClient || new CapabilityClient();
  }

  onEvent(listener: (event: EventQueueEvent) => void) {
    this.listeners.push(listener);
  }

  startPolling(queueUrl: string) {
    if (!queueUrl) throw new Error('Queue URL is required');
    this.queueUrl = queueUrl;
    this.isPolling = true;
    this.currentDelay = this.baseDelay;
    this.ackId = null;

    this.pollLoop();
  }

  stopPolling() {
    this.isPolling = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  async pollOnce(): Promise<EventQueuePollResult | null> {
    if (!this.queueUrl) return null;

    try {
      const result = await this.capClient.pollEventQueue(this.queueUrl, this.ackId);
      // Reset delay on normal poll completion
      this.currentDelay = this.baseDelay;

      if (result.id !== undefined && result.id !== null) {
        this.ackId = result.id;
      }

      for (const evt of result.events) {
        for (const listener of this.listeners) {
          try {
            listener(evt);
          } catch (e) {
            console.error('[EventQueueClient] Listener error:', e);
          }
        }
      }

      return result;
    } catch (err: any) {
      const status = err?.status;
      if (status === 502 || status === 504 || err?.name === 'TimeoutError' || err?.message?.includes('timeout')) {
        // Benign 502/504 long-poll timeout or read timeout -> reset delay immediately to baseDelay without backoff
        this.currentDelay = this.baseDelay;
      } else {
        // True network error or 500/503 status code -> exponential backoff
        this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);
      }
      throw err;
    }
  }

  private async pollLoop() {
    if (!this.isPolling) return;

    try {
      await this.pollOnce();
    } catch (e) {
      // Exception handled in pollOnce, delay updated
    }

    if (this.isPolling) {
      this.timerId = setTimeout(() => this.pollLoop(), this.currentDelay);
    }
  }
}
