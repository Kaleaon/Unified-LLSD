import test from 'node:test';
import assert from 'node:assert';
import {
  LLSD,
  UIComponent,
  bindKeyboardHandlers,
  applyFocusRingStyle,
  sanitizeCSSFocusRules
} from '../llsd.js';
import { LLDate } from '../lldate.js';
import { LLSDSerialize } from '../llsd_serialize.js';

test('64-bit integer handling', () => {
  const bigInt = 9223372036854775807n;
  const sd = new LLSD(bigInt);
  assert.strictEqual(sd.asBigInt(), bigInt);
});

test('Binary date LE endianness', () => {
  const sd = new LLSD(new LLDate(123456789.0));
  const bin = LLSDSerialize.toBinary(sd);
  const back = LLSDSerialize.fromBinary(bin);
  assert.strictEqual(Math.abs(back.asDate().secondsSinceEpoch - 123456789.0) < 0.001, true);
});

test('Notation roundtrip', () => {
  const sd = new LLSD(42n);
  const notation = LLSDSerialize.toNotation(sd);
  assert.strictEqual(notation, 'i42');
  const back = LLSDSerialize.fromNotation(notation);
  assert.strictEqual(back.asBigInt(), 42n);
});

test('Keyboard focus and activation handlers on UI components', () => {
  let activated = 0;
  let prevented = false;

  const listeners: Record<string, (evt: any) => void> = {};
  const mockElement = {
    tagName: 'CANVAS',
    attributes: {} as Record<string, string>,
    style: {} as Record<string, string>,
    tabIndex: -1,
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    addEventListener(evt: string, fn: (evt: any) => void) {
      listeners[evt] = fn;
    },
    removeEventListener(evt: string) {
      delete listeners[evt];
    }
  };

  const comp = new UIComponent(mockElement, {
    onClick: () => { activated++; },
    label: 'Render Canvas Controls'
  });

  // Verify tabindex="0" set
  assert.strictEqual(mockElement.attributes['tabindex'], '0');
  assert.strictEqual(mockElement.tabIndex, 0);

  // Verify focus ring styles applied
  assert.strictEqual(mockElement.style['outline'], '2px solid #005fcc');
  assert.strictEqual(mockElement.style['outlineOffset'], '2px');

  // Test Enter activation
  listeners['keydown']({ key: 'Enter' });
  assert.strictEqual(activated, 1);

  // Test Space activation with preventDefault
  listeners['keydown']({
    key: ' ',
    preventDefault: () => { prevented = true; }
  });
  assert.strictEqual(activated, 2);
  assert.strictEqual(prevented, true);

  comp.destroy();
});

test('Replace outline: none rules with high-contrast focus rings', () => {
  const rawCSS = '.control:focus { outline: none; } div:focus { outline: 0; }';
  const cleanCSS = sanitizeCSSFocusRules(rawCSS);

  assert.strictEqual(cleanCSS.includes('outline: none'), false);
  assert.strictEqual(cleanCSS.includes('outline: 0'), false);
  assert.strictEqual(cleanCSS.includes('outline: 2px solid #005fcc; outline-offset: 2px;'), true);
  assert.strictEqual(cleanCSS.includes(':focus-visible'), true);
});
