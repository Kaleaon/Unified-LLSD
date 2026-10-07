import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';
import { LLSDBinary } from './llbinary.js';

export enum LLSDType {
    UNDEFINED = 'undefined',
    BOOLEAN = 'boolean',
    INTEGER = 'integer',
    REAL = 'real',
    STRING = 'string',
    UUID = 'uuid',
    DATE = 'date',
    URI = 'uri',
    BINARY = 'binary',
    MAP = 'map',
    ARRAY = 'array',

    Undefined = 'undefined',
    Boolean = 'boolean',
    Integer = 'integer',
    Real = 'real',
    String = 'string',
    Date = 'date',
    Uri = 'uri',
    Binary = 'binary',
    Map = 'map',
    Array = 'array'
}

export class LLSDValue {
    public readonly type: LLSDType;
    private readonly value: any;

    public static readonly undefined = new LLSDValue();

    constructor(val?: any, type?: LLSDType) {
        if (val === undefined || val === null) {
            this.type = LLSDType.UNDEFINED;
            this.value = null;
        } else if (typeof val === 'boolean') {
            this.type = LLSDType.BOOLEAN;
            this.value = val;
        } else if (typeof val === 'bigint') {
            this.type = LLSDType.INTEGER;
            this.value = val;
        } else if (typeof val === 'number') {
            this.type = type || (Number.isInteger(val) ? LLSDType.INTEGER : LLSDType.REAL);
            this.value = val;
        } else if (typeof val === 'string') {
            this.type = LLSDType.STRING;
            this.value = val;
        } else if (val instanceof LLUUID) {
            this.type = LLSDType.UUID;
            this.value = val;
        } else if (val instanceof LLDate) {
            this.type = LLSDType.DATE;
            this.value = val;
        } else if (val instanceof LLURI) {
            this.type = LLSDType.URI;
            this.value = val;
        } else if (val instanceof LLSDBinary) {
            this.type = LLSDType.BINARY;
            this.value = val;
        } else if (val instanceof Uint8Array) {
            this.type = LLSDType.BINARY;
            this.value = new LLSDBinary(val);
        } else if (val instanceof Map) {
            this.type = LLSDType.MAP;
            this.value = val;
        } else if (Array.isArray(val)) {
            this.type = LLSDType.ARRAY;
            this.value = val;
        } else if (val instanceof LLSDValue) {
            this.type = val.type;
            this.value = val.value;
        } else {
            this.type = LLSDType.UNDEFINED;
            this.value = null;
        }
    }

    public static staticUndefined(): LLSDValue {
        return LLSDValue.undefined;
    }

    public static boolean(val: boolean): LLSDValue {
        return new LLSDValue(Boolean(val), LLSDType.BOOLEAN);
    }

    public static integer(val: number | bigint): LLSDValue {
        return new LLSDValue(typeof val === 'bigint' ? val : Math.floor(val), LLSDType.INTEGER);
    }

    public static real(val: number): LLSDValue {
        return new LLSDValue(Number(val), LLSDType.REAL);
    }

    public static string(val: string): LLSDValue {
        return new LLSDValue(String(val), LLSDType.STRING);
    }

    public static uuid(val: LLUUID | string): LLSDValue {
        const uuidObj = typeof val === 'string' ? new LLUUID(val) : val;
        return new LLSDValue(uuidObj, LLSDType.UUID);
    }

    public static date(val: LLDate | Date | string | number): LLSDValue {
        const dateObj = val instanceof LLDate ? val : new LLDate(val);
        return new LLSDValue(dateObj, LLSDType.DATE);
    }

    public static uri(val: LLURI | string): LLSDValue {
        const uriObj = typeof val === 'string' ? new LLURI(val) : val;
        return new LLSDValue(uriObj, LLSDType.URI);
    }

    public static binary(val: LLSDBinary | Uint8Array | number[]): LLSDValue {
        const binObj = val instanceof LLSDBinary ? val : new LLSDBinary(val);
        return new LLSDValue(binObj, LLSDType.BINARY);
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
        return new LLSDValue(mapObj, LLSDType.MAP);
    }

    public static array(items?: LLSDValue[]): LLSDValue {
        return new LLSDValue(items ? [...items] : [], LLSDType.ARRAY);
    }

    public static emptyMap(): LLSDValue {
        return LLSDValue.map();
    }

    public static emptyArray(): LLSDValue {
        return LLSDValue.array();
    }

    public isUndefined(): boolean {
        return this.type === LLSDType.UNDEFINED;
    }

    public isDefined(): boolean {
        return !this.isUndefined();
    }

    public asBoolean(): boolean {
        if (this.type === LLSDType.BOOLEAN) return this.value as boolean;
        if (this.type === LLSDType.INTEGER) return typeof this.value === 'bigint' ? this.value !== 0n : this.value !== 0;
        if (this.type === LLSDType.REAL) return this.value !== 0;
        if (this.type === LLSDType.STRING) {
            const lower = (this.value as string).trim().toLowerCase();
            return lower === 'true' || lower === '1' || lower === 't';
        }
        return false;
    }

    public asInteger(): number {
        return Number(this.asBigInt());
    }

    public asBigInt(): bigint {
        if (this.type === LLSDType.INTEGER) return BigInt(this.value);
        if (this.type === LLSDType.BOOLEAN) return this.value ? 1n : 0n;
        if (this.type === LLSDType.REAL) return BigInt(Math.trunc(this.value));
        if (this.type === LLSDType.STRING) {
            try { return BigInt(this.value); } catch { return 0n; }
        }
        return 0n;
    }

    public asReal(): number {
        if (this.type === LLSDType.REAL || this.type === LLSDType.INTEGER) return Number(this.value);
        if (this.type === LLSDType.BOOLEAN) return this.value ? 1 : 0;
        if (this.type === LLSDType.STRING) {
            const parsed = parseFloat(this.value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    public asString(): string {
        if (this.type === LLSDType.STRING) return this.value as string;
        if (this.type === LLSDType.UUID) return (this.value as LLUUID).toString();
        if (this.type === LLSDType.URI) return (this.value as LLURI).toString();
        if (this.type === LLSDType.DATE) return (this.value as LLDate).toISOString();
        if (this.type === LLSDType.BINARY) return (this.value as LLSDBinary).toBase64();
        if (this.type === LLSDType.BOOLEAN) return this.value ? 'true' : 'false';
        if (this.type === LLSDType.INTEGER || this.type === LLSDType.REAL) return String(this.value);
        if (this.type === LLSDType.UNDEFINED) return '';
        return JSON.stringify(this.value);
    }

    public asUUID(): LLUUID {
        if (this.type === LLSDType.UUID) return this.value as LLUUID;
        if (this.type === LLSDType.STRING) return new LLUUID(this.value as string);
        return LLUUID.NULL;
    }

    public asDate(): LLDate {
        if (this.type === LLSDType.DATE) return this.value as LLDate;
        if (this.type === LLSDType.STRING || this.type === LLSDType.REAL || this.type === LLSDType.INTEGER) {
            return new LLDate(this.value);
        }
        return LLDate.nullDate;
    }

    public asURI(): LLURI {
        if (this.type === LLSDType.URI) return this.value as LLURI;
        if (this.type === LLSDType.STRING) return new LLURI(this.value as string);
        return new LLURI('');
    }

    public asBinary(): LLSDBinary {
        if (this.type === LLSDType.BINARY) return this.value as LLSDBinary;
        if (this.type === LLSDType.STRING) return LLSDBinary.fromBase64(this.value as string);
        return new LLSDBinary(new Uint8Array(0));
    }

    public get(keyOrIndex: string | number): LLSDValue {
        if (this.type === LLSDType.MAP && typeof keyOrIndex === 'string') {
            const mapObj = this.value as Map<string, LLSDValue>;
            return mapObj.get(keyOrIndex) || LLSDValue.undefined;
        }
        if (this.type === LLSDType.ARRAY && typeof keyOrIndex === 'number') {
            const arr = this.value as LLSDValue[];
            if (keyOrIndex >= 0 && keyOrIndex < arr.length) return arr[keyOrIndex];
        }
        return LLSDValue.undefined;
    }

    public getAt(index: number): LLSDValue {
        return this.get(index);
    }

    public set(keyOrIndex: string | number, val: LLSDValue): void {
        if (this.type === LLSDType.MAP && typeof keyOrIndex === 'string') {
            (this.value as Map<string, LLSDValue>).set(keyOrIndex, val);
        } else if (this.type === LLSDType.ARRAY && typeof keyOrIndex === 'number') {
            const arr = this.value as LLSDValue[];
            while (arr.length <= keyOrIndex) arr.push(LLSDValue.undefined);
            arr[keyOrIndex] = val;
        }
    }

    public get asMap(): Map<string, LLSDValue> {
        if (this.type === LLSDType.MAP) return this.value as Map<string, LLSDValue>;
        return new Map();
    }

    public get asArray(): LLSDValue[] {
        if (this.type === LLSDType.ARRAY) return this.value as LLSDValue[];
        return [];
    }
}

export { LLSDValue as LLSD };
