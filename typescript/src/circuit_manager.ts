export interface UnackedPacket {
  sequenceNumber: number;
  packetData: Uint8Array;
  sentTime: number;
  retries: number;
}

export class CircuitManager {
  readonly circuitCode: number;
  private nextOutSequenceNumber = 1;
  private receivedSequences = new Set<number>();
  private pendingAcks: number[] = [];
  private unackedPackets = new Map<number, UnackedPacket>();

  isConnected = true;
  lastPacketReceivedTime = Date.now();

  constructor(circuitCode: number) {
    this.circuitCode = circuitCode;
  }

  getNextSequenceNumber(): number {
    return this.nextOutSequenceNumber++;
  }

  processInboundPacket(sequenceNumber: number, reliable: boolean): boolean {
    this.lastPacketReceivedTime = Date.now();

    if (this.receivedSequences.has(sequenceNumber)) {
      if (reliable) {
        this.pendingAcks.push(sequenceNumber);
      }
      return false;
    }

    this.receivedSequences.add(sequenceNumber);

    if (this.receivedSequences.size > 2048) {
      let minSeq = Infinity;
      for (const seq of this.receivedSequences) {
        if (seq < minSeq) minSeq = seq;
      }
      if (minSeq !== Infinity) {
        this.receivedSequences.delete(minSeq);
      }
    }

    if (reliable) {
      this.pendingAcks.push(sequenceNumber);
    }

    return true;
  }

  trackOutgoingPacket(sequenceNumber: number, packetData: Uint8Array): void {
    this.unackedPackets.set(sequenceNumber, {
      sequenceNumber,
      packetData,
      sentTime: Date.now(),
      retries: 0,
    });
  }

  processAcks(acks: number[]): void {
    for (const ack of acks) {
      this.unackedPackets.delete(ack);
    }
  }

  getPendingAcks(maxCount = 255): number[] {
    const count = Math.min(maxCount, this.pendingAcks.length);
    return this.pendingAcks.splice(0, count);
  }

  getPacketsToResend(timeoutMs: number, maxRetries = 3): UnackedPacket[] {
    const now = Date.now();
    const resendList: UnackedPacket[] = [];
    const timedOutKeys: number[] = [];

    for (const [seq, packet] of this.unackedPackets.entries()) {
      if (now - packet.sentTime > timeoutMs) {
        if (packet.retries >= maxRetries) {
          timedOutKeys.push(seq);
        } else {
          packet.retries++;
          packet.sentTime = now;
          resendList.push({ ...packet });
        }
      }
    }

    for (const key of timedOutKeys) {
      this.unackedPackets.delete(key);
    }

    return resendList;
  }
}
