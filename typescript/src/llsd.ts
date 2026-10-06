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

export const DEFAULT_FOCUS_RING_STYLE = 'outline: 2px solid #005fcc; outline-offset: 2px;';
export const FOCUS_VISIBLE_CSS_RULE = '*:focus-visible, div:focus-visible, canvas:focus-visible, [tabindex="0"]:focus-visible { outline: 2px solid #005fcc; outline-offset: 2px; }';

export interface KeyboardEventLike {
  key?: string;
  keyCode?: number;
  preventDefault?: () => void;
  [key: string]: any;
}

export interface UIComponentOptions {
  onClick?: (evt?: any) => void;
  label?: string;
  role?: string;
  focusRingColor?: string;
}

export function sanitizeCSSFocusRules(css: string, focusRingColor: string = '#005fcc'): string {
  const replacement = `outline: 2px solid ${focusRingColor}; outline-offset: 2px;`;
  let sanitized = css.replace(/outline\s*:\s*(none|0)(\s*!important)?\s*;?/gi, replacement);
  if (!sanitized.includes(':focus-visible')) {
    sanitized += `\n${FOCUS_VISIBLE_CSS_RULE}`;
  }
  return sanitized;
}

export function applyFocusRingStyle(element: any, focusRingColor: string = '#005fcc'): void {
  if (!element) return;
  if (element.style) {
    element.style.outline = `2px solid ${focusRingColor}`;
    element.style.outlineOffset = '2px';
  }
}

export function bindKeyboardHandlers(element: any, onClick: (evt?: any) => void, options: UIComponentOptions = {}): () => void {
  if (!element) return () => {};

  if (typeof element.setAttribute === 'function') {
    element.setAttribute('tabindex', '0');
  }
  element.tabIndex = 0;

  if (options.role && typeof element.setAttribute === 'function') {
    element.setAttribute('role', options.role);
  }

  if (options.label && typeof element.setAttribute === 'function') {
    element.setAttribute('aria-label', options.label);
  }

  applyFocusRingStyle(element, options.focusRingColor);

  const handleKeyDown = (evt: KeyboardEventLike) => {
    const key = evt.key || (evt.keyCode === 13 ? 'Enter' : (evt.keyCode === 32 ? ' ' : ''));
    if (key === ' ' || key === 'Space' || key === 'Spacebar' || evt.keyCode === 32) {
      if (typeof evt.preventDefault === 'function') {
        evt.preventDefault();
      }
      onClick(evt);
    } else if (key === 'Enter' || evt.keyCode === 13) {
      onClick(evt);
    }
  };

  if (typeof element.addEventListener === 'function') {
    element.addEventListener('click', onClick);
    element.addEventListener('keydown', handleKeyDown);
  }

  return () => {
    if (typeof element.removeEventListener === 'function') {
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', handleKeyDown);
    }
  };
}

export class UIComponent {
  public element: any;
  private onClickCallback?: (evt?: any) => void;
  private unbindFn: () => void = () => {};

  constructor(element: any, options: UIComponentOptions = {}) {
    this.element = element;
    this.onClickCallback = options.onClick;
    this.init(options);
  }

  private init(options: UIComponentOptions): void {
    if (!this.element) return;
    this.unbindFn = bindKeyboardHandlers(this.element, (evt) => {
      if (this.onClickCallback) {
        this.onClickCallback(evt);
      }
    }, options);
  }

  public setOnClick(callback: (evt?: any) => void): void {
    this.onClickCallback = callback;
  }

  public activate(evt?: any): void {
    if (this.onClickCallback) {
      this.onClickCallback(evt);
    }
  }

  public destroy(): void {
    this.unbindFn();
  }
}
