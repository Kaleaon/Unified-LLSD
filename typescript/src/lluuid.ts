export class LLUUID {
  public readonly bytes: Uint8Array;

  public static readonly nullUuid = new LLUUID(new Uint8Array(16));

  constructor(bytesOrString?: Uint8Array | string) {
    if (!bytesOrString) {
      this.bytes = new Uint8Array(16);
    } else if (typeof bytesOrString === 'string') {
      const clean = bytesOrString.replace(/[-{}]/g, '');
      if (clean.length !== 32) {
        this.bytes = new Uint8Array(16);
      } else {
        this.bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
          this.bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
        }
      }
    } else {
      if (bytesOrString.length !== 16) {
        throw new Error('UUID Uint8Array must be 16 bytes');
      }
      this.bytes = new Uint8Array(bytesOrString);
    }
  }

  public get isNull(): boolean {
    return this.bytes.every(b => b === 0);
  }

  public get notNull(): boolean {
    return !this.isNull;
  }

  public toString(): string {
    let hex = '';
    for (let i = 0; i < 16; i++) {
      if (i === 4 || i === 6 || i === 8 || i === 10) hex += '-';
      hex += this.bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
}
