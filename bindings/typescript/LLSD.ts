/**
 * Linden Lab Structured Data (LLSD) Data Model in TypeScript.
 */

export class LLUUID {
    public static readonly NULL = new LLUUID('00000000-0000-0000-0000-000000000000');
    private readonly value: string;

    constructor(uuidStr?: string) {
        if (!uuidStr) {
            this.value = '00000000-0000-0000-0000-000000000000';
        } else {
            const cleaned = uuidStr.trim().toLowerCase();
            if (!LLUUID.validate(cleaned)) {
                throw new Error(`Invalid UUID format: ${uuidStr}`);
            }
            this.value = cleaned;
        }
    }

    public static validate(str: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    }

    public toString(): string {
        return this.value;
    }

    public isNull(): boolean {
        return this.value === '00000000-0000-0000-0000-000000000000';
    }

    public toBytes(): Uint8Array {
        const hex = this.value.replace(/-/g, '');
        const bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
            bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    public static fromBytes(bytes: Uint8Array, offset: number = 0): LLUUID {
        if (bytes.length < offset + 16) {
            throw new Error('Buffer too small for UUID');
        }
        let hex = '';
        for (let i = 0; i < 16; i++) {
            const b = bytes[offset + i].toString(16).padStart(2, '0');
            hex += b;
        }
        const formatted = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
        return new LLUUID(formatted);
    }
}

export class LLSDDate {
    public readonly date: Date;

    constructor(dateInput?: Date | string | number) {
        if (dateInput instanceof Date) {
            this.date = dateInput;
        } else if (typeof dateInput === 'number') {
            this.date = new Date(dateInput * 1000);
        } else if (typeof dateInput === 'string') {
            this.date = new Date(dateInput);
        } else {
            this.date = new Date();
        }
    }

    public toISOString(): string {
        return this.date.toISOString();
    }

    public getSecondsSinceEpoch(): number {
        return this.date.getTime() / 1000.0;
    }
}

export class LLSDURI {
    public readonly uri: string;

    constructor(uri: string) {
        this.uri = uri;
    }

    public toString(): string {
        return this.uri;
    }
}

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

export enum LLSDType {
    UNDEFINED,
    BOOLEAN,
    INTEGER,
    REAL,
    STRING,
    UUID,
    DATE,
    URI,
    BINARY,
    MAP,
    ARRAY
}

export class LLSDValue {
    public readonly type: LLSDType;
    private readonly raw: any;

    constructor(type: LLSDType = LLSDType.UNDEFINED, rawValue: any = null) {
        this.type = type;
        this.raw = rawValue;
    }

    public static undefined(): LLSDValue {
        return new LLSDValue(LLSDType.UNDEFINED, null);
    }

    public static boolean(val: boolean): LLSDValue {
        return new LLSDValue(LLSDType.BOOLEAN, Boolean(val));
    }

    public static integer(val: number): LLSDValue {
        return new LLSDValue(LLSDType.INTEGER, Math.floor(val));
    }

    public static real(val: number): LLSDValue {
        return new LLSDValue(LLSDType.REAL, Number(val));
    }

    public static string(val: string): LLSDValue {
        return new LLSDValue(LLSDType.STRING, String(val));
    }

    public static uuid(val: LLUUID | string): LLSDValue {
        const uuidObj = typeof val === 'string' ? new LLUUID(val) : val;
        return new LLSDValue(LLSDType.UUID, uuidObj);
    }

    public static date(val: LLSDDate | Date | string | number): LLSDValue {
        const dateObj = val instanceof LLSDDate ? val : new LLSDDate(val);
        return new LLSDValue(LLSDType.DATE, dateObj);
    }

    public static uri(val: LLSDURI | string): LLSDValue {
        const uriObj = typeof val === 'string' ? new LLSDURI(val) : val;
        return new LLSDValue(LLSDType.URI, uriObj);
    }

    public static binary(val: LLSDBinary | Uint8Array): LLSDValue {
        const binObj = val instanceof LLSDBinary ? val : new LLSDBinary(val);
        return new LLSDValue(LLSDType.BINARY, binObj);
    }

    public static map(entries?: Record<string, LLSDValue> | Map<string, LLSDValue>): LLSDValue {
        const mapObj = new Map<string, LLSDValue>();
        if (entries) {
            if (entries instanceof Map) {
                entries.forEach((v, k) => mapObj.set(k, v));
            } else {
                for (const [k, v] of Object.entries(entries)) {
                    mapObj.set(k, v);
                }
            }
        }
        return new LLSDValue(LLSDType.MAP, mapObj);
    }

    public static fromJSObject(obj: any): LLSDValue {
        if (obj === null || obj === undefined) return LLSDValue.undefined();
        if (obj instanceof LLSDValue) return obj;
        if (typeof obj === 'boolean') return LLSDValue.boolean(obj);
        if (typeof obj === 'number') return Number.isInteger(obj) ? LLSDValue.integer(obj) : LLSDValue.real(obj);
        if (typeof obj === 'string') return LLSDValue.string(obj);
        if (Array.isArray(obj)) return LLSDValue.array(obj.map(item => LLSDValue.fromJSObject(item)));
        if (typeof obj === 'object') {
            const mapObj = new Map<string, LLSDValue>();
            for (const [k, v] of Object.entries(obj)) {
                mapObj.set(k, LLSDValue.fromJSObject(v));
            }
            return new LLSDValue(LLSDType.MAP, mapObj);
        }
        return LLSDValue.undefined();
    }

    public static array(items?: LLSDValue[]): LLSDValue {
        return new LLSDValue(LLSDType.ARRAY, items ? [...items] : []);
    }

    public isUndefined(): boolean {
        return this.type === LLSDType.UNDEFINED;
    }

    public asBoolean(): boolean {
        if (this.type === LLSDType.BOOLEAN) return this.raw as boolean;
        if (this.type === LLSDType.INTEGER || this.type === LLSDType.REAL) return this.raw !== 0;
        if (this.type === LLSDType.STRING) {
            const lower = (this.raw as string).trim().toLowerCase();
            return lower === 'true' || lower === '1' || lower === 't';
        }
        return false;
    }

    public asInteger(): number {
        if (this.type === LLSDType.INTEGER) return this.raw as number;
        if (this.type === LLSDType.REAL) return Math.floor(this.raw as number);
        if (this.type === LLSDType.BOOLEAN) return this.raw ? 1 : 0;
        if (this.type === LLSDType.STRING) {
            const parsed = parseInt(this.raw as string, 10);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    public asReal(): number {
        if (this.type === LLSDType.REAL) return this.raw as number;
        if (this.type === LLSDType.INTEGER) return this.raw as number;
        if (this.type === LLSDType.BOOLEAN) return this.raw ? 1.0 : 0.0;
        if (this.type === LLSDType.STRING) {
            const parsed = parseFloat(this.raw as string);
            return isNaN(parsed) ? 0.0 : parsed;
        }
        return 0.0;
    }

    public asString(): string {
        if (this.type === LLSDType.STRING) return this.raw as string;
        if (this.type === LLSDType.UUID) return (this.raw as LLUUID).toString();
        if (this.type === LLSDType.URI) return (this.raw as LLSDURI).toString();
        if (this.type === LLSDType.DATE) return (this.raw as LLSDDate).toISOString();
        if (this.type === LLSDType.BINARY) return (this.raw as LLSDBinary).toBase64();
        if (this.type === LLSDType.BOOLEAN) return this.raw ? 'true' : 'false';
        if (this.type === LLSDType.INTEGER || this.type === LLSDType.REAL) return String(this.raw);
        if (this.type === LLSDType.UNDEFINED) return '';
        return JSON.stringify(this.raw);
    }

    public asUUID(): LLUUID {
        if (this.type === LLSDType.UUID) return this.raw as LLUUID;
        if (this.type === LLSDType.STRING) return new LLUUID(this.raw as string);
        return LLUUID.NULL;
    }

    public asDate(): LLSDDate {
        if (this.type === LLSDType.DATE) return this.raw as LLSDDate;
        if (this.type === LLSDType.STRING || this.type === LLSDType.REAL || this.type === LLSDType.INTEGER) {
            return new LLSDDate(this.raw);
        }
        return new LLSDDate(0);
    }

    public asURI(): LLSDURI {
        if (this.type === LLSDType.URI) return this.raw as LLSDURI;
        if (this.type === LLSDType.STRING) return new LLSDURI(this.raw as string);
        return new LLSDURI('');
    }

    public asBinary(): LLSDBinary {
        if (this.type === LLSDType.BINARY) return this.raw as LLSDBinary;
        if (this.type === LLSDType.STRING) return LLSDBinary.fromBase64(this.raw as string);
        return new LLSDBinary(new Uint8Array(0));
    }

    public get(key: string): LLSDValue {
        if (this.type === LLSDType.MAP) {
            const mapObj = this.raw as Map<string, LLSDValue>;
            return mapObj.get(key) || LLSDValue.undefined();
        }
        return LLSDValue.undefined();
    }

    public getAt(index: number): LLSDValue {
        if (this.type === LLSDType.ARRAY) {
            const arr = this.raw as LLSDValue[];
            return (index >= 0 && index < arr.length) ? arr[index] : LLSDValue.undefined();
        }
        return LLSDValue.undefined();
    }

    public get asMap(): Map<string, LLSDValue> {
        if (this.type === LLSDType.MAP) return this.raw as Map<string, LLSDValue>;
        return new Map();
    }

    public get asArray(): LLSDValue[] {
        if (this.type === LLSDType.ARRAY) return this.raw as LLSDValue[];
        return [];
    }
}
