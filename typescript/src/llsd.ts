import { LLUUID } from './lluuid.js';
import { LLDate } from './lldate.js';
import { LLURI } from './lluri.js';

export enum LLSDType {
  Undefined = 'undefined',
  Boolean = 'boolean',
  Integer = 'integer',
  Real = 'real',
  String = 'string',
  UUID = 'uuid',
  Date = 'date',
  URI = 'uri',
  Binary = 'binary',
  Map = 'map',
  Array = 'array',
}

export class LLSD {
  public readonly type: LLSDType;
  private readonly value: any;

  public static readonly undefined = new LLSD();

  constructor(val?: any, type?: LLSDType) {
    if (val === undefined || val === null) {
      this.type = LLSDType.Undefined;
      this.value = null;
    } else if (typeof val === 'boolean') {
      this.type = LLSDType.Boolean;
      this.value = val;
    } else if (typeof val === 'bigint') {
      this.type = LLSDType.Integer;
      this.value = val;
    } else if (typeof val === 'number') {
      this.type = type || (Number.isInteger(val) ? LLSDType.Integer : LLSDType.Real);
      this.value = val;
    } else if (typeof val === 'string') {
      this.type = LLSDType.String;
      this.value = val;
    } else if (val instanceof LLUUID) {
      this.type = LLSDType.UUID;
      this.value = val;
    } else if (val instanceof LLDate) {
      this.type = LLSDType.Date;
      this.value = val;
    } else if (val instanceof LLURI) {
      this.type = LLSDType.URI;
      this.value = val;
    } else if (val instanceof Uint8Array) {
      this.type = LLSDType.Binary;
      this.value = val;
    } else if (val instanceof Map) {
      this.type = LLSDType.Map;
      this.value = val;
    } else if (Array.isArray(val)) {
      this.type = LLSDType.Array;
      this.value = val;
    } else {
      this.type = LLSDType.Undefined;
      this.value = null;
    }
  }

  public get isUndefined(): boolean { return this.type === LLSDType.Undefined; }
  public get isDefined(): boolean { return !this.isUndefined; }

  public asBoolean(): boolean {
    if (this.type === LLSDType.Boolean) return this.value;
    if (this.type === LLSDType.Integer) return this.value !== 0 && this.value !== 0n;
    if (this.type === LLSDType.Real) return this.value !== 0;
    if (this.type === LLSDType.String) return this.value.length > 0;
    return false;
  }

  public asInteger(): number {
    return Number(this.asBigInt());
  }

  public asBigInt(): bigint {
    if (this.type === LLSDType.Integer) return BigInt(this.value);
    if (this.type === LLSDType.Boolean) return this.value ? 1n : 0n;
    if (this.type === LLSDType.Real) return BigInt(Math.trunc(this.value));
    if (this.type === LLSDType.String) {
      try { return BigInt(this.value); } catch { return 0n; }
    }
    return 0n;
  }

  public asReal(): number {
    if (this.type === LLSDType.Real || this.type === LLSDType.Integer) return Number(this.value);
    if (this.type === LLSDType.Boolean) return this.value ? 1 : 0;
    if (this.type === LLSDType.String) {
      const parsed = parseFloat(this.value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  public asString(): string {
    if (this.type === LLSDType.String) return this.value;
    if (this.type === LLSDType.Boolean) return this.value ? 'true' : 'false';
    if (this.type === LLSDType.Integer || this.type === LLSDType.Real) return String(this.value);
    if (this.type === LLSDType.UUID) return this.value.toString();
    if (this.type === LLSDType.Date) return this.value.toISOString();
    if (this.type === LLSDType.URI) return this.value.asString();
    return '';
  }

  public asUUID(): LLUUID {
    if (this.type === LLSDType.UUID) return this.value;
    if (this.type === LLSDType.String) return new LLUUID(this.value);
    return LLUUID.nullUuid;
  }

  public asDate(): LLDate {
    if (this.type === LLSDType.Date) return this.value;
    if (this.type === LLSDType.String) return new LLDate(this.value);
    return LLDate.nullDate;
  }

  public asURI(): LLURI {
    if (this.type === LLSDType.URI) return this.value;
    if (this.type === LLSDType.String) return new LLURI(this.value);
    return new LLURI('');
  }

  public asBinary(): Uint8Array {
    if (this.type === LLSDType.Binary) return this.value;
    return new Uint8Array(0);
  }

  public asMap(): Map<string, LLSD> {
    if (this.type === LLSDType.Map) return this.value as Map<string, LLSD>;
    return new Map<string, LLSD>();
  }

  public asArray(): LLSD[] {
    if (this.type === LLSDType.Array) return this.value as LLSD[];
    return [];
  }

  public get size(): number {
    if (this.type === LLSDType.Map) return (this.value as Map<string, LLSD>).size;
    if (this.type === LLSDType.Array) return (this.value as LLSD[]).length;
    return 0;
  }

  public get(keyOrIndex: string | number): LLSD {
    if (this.type === LLSDType.Map && typeof keyOrIndex === 'string') {
      return (this.value as Map<string, LLSD>).get(keyOrIndex) || LLSD.undefined;
    }
    if (this.type === LLSDType.Array && typeof keyOrIndex === 'number') {
      const arr = this.value as LLSD[];
      if (keyOrIndex >= 0 && keyOrIndex < arr.length) return arr[keyOrIndex];
    }
    return LLSD.undefined;
  }

  public set(keyOrIndex: string | number, val: LLSD): void {
    if (this.type === LLSDType.Map && typeof keyOrIndex === 'string') {
      (this.value as Map<string, LLSD>).set(keyOrIndex, val);
    } else if (this.type === LLSDType.Array && typeof keyOrIndex === 'number') {
      const arr = this.value as LLSD[];
      while (arr.length <= keyOrIndex) arr.push(LLSD.undefined);
      arr[keyOrIndex] = val;
    }
  }

  public static emptyMap(): LLSD {
    return new LLSD(new Map<string, LLSD>());
  }

  public static emptyArray(): LLSD {
    return new LLSD([]);
  }
}
