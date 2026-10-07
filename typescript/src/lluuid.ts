export class LLUUID {
    public readonly bytes: Uint8Array;

    public static readonly NULL = new LLUUID('00000000-0000-0000-0000-000000000000');
    public static get nullUuid(): LLUUID {
        return LLUUID.NULL;
    }

    constructor(bytesOrString?: Uint8Array | string) {
        if (!bytesOrString) {
            this.bytes = new Uint8Array(16);
        } else if (typeof bytesOrString === 'string') {
            const clean = bytesOrString.trim().toLowerCase().replace(/[-{}]/g, '');
            if (clean.length !== 32) {
                this.bytes = new Uint8Array(16);
            } else {
                this.bytes = new Uint8Array(16);
                for (let i = 0; i < 16; i++) {
                    this.bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
                }
            }
        } else {
            if (bytesOrString.length < 16) {
                throw new Error('UUID Uint8Array must be at least 16 bytes');
            }
            this.bytes = bytesOrString.length === 16 ? new Uint8Array(bytesOrString) : bytesOrString.slice(0, 16);
        }
    }

    public static validate(str: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
    }

    public isNull(): boolean {
        return this.bytes.every(b => b === 0);
    }

    public get isNullProperty(): boolean {
        return this.isNull();
    }

    // Support both property access (.isNull) and method call (.isNull())
    public get notNull(): boolean {
        return !this.isNull();
    }

    public toBytes(): Uint8Array {
        return new Uint8Array(this.bytes);
    }

    public static fromBytes(bytes: Uint8Array, offset: number = 0): LLUUID {
        if (bytes.length < offset + 16) {
            throw new Error('Buffer too small for UUID');
        }
        return new LLUUID(bytes.subarray(offset, offset + 16));
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
