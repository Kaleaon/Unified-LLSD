export class LLSDBinary {
    public readonly bytes: Uint8Array;

    constructor(data: Uint8Array | number[]) {
        this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    public toBase64(): string {
        return Buffer.from(this.bytes).toString('base64');
    }

    public static fromBase64(b64: string): LLSDBinary {
        const buf = Buffer.from(b64, 'base64');
        return new LLSDBinary(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    }
}
