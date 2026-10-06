import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AlphaMode,
    DetailLevel,
    AssetSchemaConstants,
    TextureTransformAdapter,
    LLSDValue,
    LLSDType,
    LLUUID,
    LLSDDate,
    LLSDURI,
    LLSDBinary,
    LLSDSerialize,
    MeshAssetDecoder,
    bindKeyboardHandlers,
    applyFocusRingStyle,
    sanitizeCSSFocusRules,
    UIComponent
} from '../index.js';

test('AssetSchemaAdapter constants and LOD mapping', () => {
    assert.equal(AssetSchemaConstants.MAX_RIGGED_MESH_JOINTS, 256);
    assert.equal(AssetSchemaConstants.JOINT_SENTINEL, 0xFF);

    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.HIGHEST), 'high_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.HIGH), 'high_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.MEDIUM), 'medium_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.LOW), 'low_lod');
    assert.equal(AssetSchemaConstants.getLodKey(DetailLevel.LOWEST), 'lowest_lod');
});

test('TextureTransformAdapter Float32Array packing', () => {
    const transform = new TextureTransformAdapter(2.0, 3.0, 1.5707963, 0.5, 0.25);

    const packed = transform.getPacked();
    assert.equal(packed.length, 8);
    assert.equal(packed[0], 2.0);
    assert.equal(packed[1], 3.0);
    assert.ok(Math.abs(packed[2] - 1.5707963) < 0.0001);
    assert.equal(packed[3], 0.0);
    assert.equal(packed[4], 0.5);
    assert.equal(packed[5], 0.25);
    assert.equal(packed[6], 0.0);
    assert.equal(packed[7], 0.0);

    const tight = transform.getPackedTight();
    assert.equal(tight.length, 5);
    assert.equal(tight[0], 2.0);
    assert.equal(tight[1], 3.0);
    assert.ok(Math.abs(tight[2] - 1.5707963) < 0.0001);
    assert.equal(tight[3], 0.5);
    assert.equal(tight[4], 0.25);
});

test('LLSD Value Types and Conversions', () => {
    const uuidStr = '12345678-1234-1234-1234-123456789abc';
    const uuidVal = LLSDValue.uuid(uuidStr);
    assert.equal(uuidVal.asUUID().toString(), uuidStr);

    const mapVal = LLSDValue.map({
        active: LLSDValue.boolean(true),
        count: LLSDValue.integer(42),
        name: LLSDValue.string('Avatar')
    });

    assert.equal(mapVal.get('active').asBoolean(), true);
    assert.equal(mapVal.get('count').asInteger(), 42);
    assert.equal(mapVal.get('name').asString(), 'Avatar');
    assert.equal(mapVal.get('nonexistent').isUndefined(), true);
});

test('LLSD Multi-Format Serialization & Auto-Detect', () => {
    const original = LLSDValue.map({
        agent_id: LLSDValue.uuid('00000000-0000-0000-0000-000000000001'),
        name: LLSDValue.string('Second Life User'),
        balance: LLSDValue.integer(250)
    });

    // Notation
    const notationStr = LLSDSerialize.toNotation(original);
    const parsedNotation = LLSDSerialize.fromNotation(notationStr);
    assert.equal(parsedNotation.get('name').asString(), 'Second Life User');

    // Binary
    const binaryData = LLSDSerialize.toBinary(original);
    const parsedBinary = LLSDSerialize.fromBinary(binaryData);
    assert.equal(parsedBinary.get('name').asString(), 'Second Life User');
    assert.equal(parsedBinary.get('balance').asInteger(), 250);

    // XML
    const xmlStr = LLSDSerialize.toXML(original);
    const parsedXML = LLSDSerialize.fromXML(xmlStr);
    assert.equal(parsedXML.get('name').asString(), 'Second Life User');

    // Auto Detect Binary
    const autoParsed = LLSDSerialize.parse(binaryData);
    assert.equal(autoParsed.get('balance').asInteger(), 250);
});

test('MeshAssetDecoder Joint Influence Parsing and Sentinel Support', () => {
    // Construct mock binary joint influence buffer with extended skeleton joint (>163) and 0xFF sentinel
    const mockBuffer = new Uint8Array([
        0, 0, 128,   // Joint 0, weight ~0.5 (128/255 -> 0.5)
        165, 0, 255, // Joint 165 (extended skeleton joint > 163), weight ~1.0
        0xFF         // Sentinel end of list
    ]);

    const result = MeshAssetDecoder.parseJointInfluences(mockBuffer);
    assert.equal(result.jointInfluences.length, 2);
    assert.equal(result.jointInfluences[0].jointIndex, 0);
    assert.equal(result.jointInfluences[1].jointIndex, 165); // Successfully parsed joint 165!
    assert.ok(Math.abs(result.jointInfluences[1].weight - 1.0) < 0.01);
});

test('UI Component tabindex="0" and Keyboard Activation Handlers (Enter / Space)', () => {
    let clickCount = 0;
    let defaultPrevented = false;

    // Mock div/canvas interactive DOM element
    const listeners: Record<string, (evt: any) => void> = {};
    const mockControl = {
        tagName: 'DIV',
        attributes: {} as Record<string, string>,
        style: {} as Record<string, string>,
        tabIndex: -1,
        setAttribute(name: string, val: string) {
            this.attributes[name] = val;
        },
        addEventListener(event: string, fn: (evt: any) => void) {
            listeners[event] = fn;
        },
        removeEventListener(event: string) {
            delete listeners[event];
        }
    };

    const component = new UIComponent(mockControl, {
        onClick: () => { clickCount++; },
        label: 'Interactive Viewer Canvas',
        role: 'button'
    });

    // Check tabindex="0" set on div / canvas element
    assert.equal(mockControl.attributes['tabindex'], '0');
    assert.equal(mockControl.tabIndex, 0);
    assert.equal(mockControl.attributes['role'], 'button');
    assert.equal(mockControl.attributes['aria-label'], 'Interactive Viewer Canvas');

    // Check high contrast focus ring style applied
    assert.equal(mockControl.style['outline'], '2px solid #005fcc');
    assert.equal(mockControl.style['outlineOffset'], '2px');

    // Simulate Enter keydown
    listeners['keydown']({ key: 'Enter' });
    assert.equal(clickCount, 1);

    // Simulate Space keydown and verify preventDefault() called to stop page scroll
    listeners['keydown']({
        key: ' ',
        preventDefault: () => { defaultPrevented = true; }
    });
    assert.equal(clickCount, 2);
    assert.equal(defaultPrevented, true);

    // Simulate Tab / Arrow keys (should NOT trigger click)
    listeners['keydown']({ key: 'Tab' });
    listeners['keydown']({ key: 'ArrowDown' });
    assert.equal(clickCount, 2);

    component.destroy();
});

test('CSS focus ring rules replace outline: none with high-contrast visible focus rings', () => {
    const badCSS = `
        .viewer-control { outline: none; border: 1px solid #ccc; }
        canvas:focus { outline: 0 !important; }
    `;

    const sanitized = sanitizeCSSFocusRules(badCSS);

    assert.ok(!sanitized.includes('outline: none'));
    assert.ok(!sanitized.includes('outline: 0'));
    assert.ok(sanitized.includes('outline: 2px solid #005fcc; outline-offset: 2px;'));
    assert.ok(sanitized.includes(':focus-visible'));
});
