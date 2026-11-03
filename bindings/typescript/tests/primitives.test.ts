import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Initialize global DOM environment for JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body><button id="trigger">Open Modal</button></body></html>', {
    url: 'http://localhost'
});
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLDivElement = dom.window.HTMLDivElement;
globalThis.HTMLSpanElement = dom.window.HTMLSpanElement;
globalThis.HTMLHeadingElement = dom.window.HTMLHeadingElement;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;

import {
    calculateContrastRatio,
    verifyContrastRatio,
    DESIGN_TOKENS,
    validateAccessibilityProps,
    AccessibleButton,
    AccessibleDialog,
    AccessibleSlider,
    AccessibleBadge,
    MeshAssetDecoder,
    DetailLevel,
    AlphaMode
} from '../index.js';

test('Color tokens & WCAG 1.4.3 Contrast Ratio Calculation', () => {
    // Standard white on black ratio is 21:1
    const maxRatio = calculateContrastRatio('#FFFFFF', '#000000');
    assert.equal(maxRatio, 21);

    // Primary button tokens pass 4.5:1 minimum
    const passesPrimary = verifyContrastRatio(
        DESIGN_TOKENS.button.primary.foreground,
        DESIGN_TOKENS.button.primary.background,
        4.5
    );
    assert.equal(passesPrimary, true);

    // Dialog text pass 4.5:1 minimum
    const passesDialog = verifyContrastRatio(
        DESIGN_TOKENS.dialog.text,
        DESIGN_TOKENS.dialog.background,
        4.5
    );
    assert.equal(passesDialog, true);

    // All badge variants pass 4.5:1 contrast requirement
    const badgeVariants = ['default', 'info', 'success', 'warning', 'error'] as const;
    for (const v of badgeVariants) {
        const token = DESIGN_TOKENS.badge[v];
        const passesBadge = verifyContrastRatio(token.foreground, token.background, 4.5);
        assert.equal(passesBadge, true, `Badge variant "${v}" failed WCAG 4.5:1 contrast check`);
    }

    // Low contrast colors fail verification
    const lowContrastPass = verifyContrastRatio('#777777', '#888888', 4.5);
    assert.equal(lowContrastPass, false);
});

test('AccessibleControl mandatory label validation', () => {
    // Valid props with ariaLabel
    assert.doesNotThrow(() => {
        validateAccessibilityProps({ ariaLabel: 'Submit Form' }, 'TestComponent');
    });

    // Valid props with ariaLabelledBy
    assert.doesNotThrow(() => {
        validateAccessibilityProps({ ariaLabelledBy: 'heading-id' }, 'TestComponent');
    });

    // Missing both ariaLabel and ariaLabelledBy throws WCAG 4.1.2 violation error
    assert.throws(() => {
        validateAccessibilityProps({}, 'TestComponent');
    }, /WCAG 2.2 4.1.2 Violation/);
});

test('AccessibleButton ARIA roles, state, and click/keyboard events', () => {
    let clicked = false;
    const btnPrimitive = new AccessibleButton({
        label: 'Apply Filter',
        ariaLabel: 'Apply texture filter',
        onClick: () => { clicked = true; }
    });

    const el = btnPrimitive.getElement();
    document.body.appendChild(el);

    // 4.1.2 Name, Role, Value checks
    assert.equal(el.getAttribute('role'), 'button');
    assert.equal(el.getAttribute('aria-label'), 'Apply texture filter');
    assert.equal(el.getAttribute('tabindex'), '0');

    // Click trigger
    el.click();
    assert.equal(clicked, true);

    // Keyboard trigger (Enter key)
    clicked = false;
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    el.dispatchEvent(enterEvent);
    assert.equal(clicked, true);

    // Dynamic expanded state update
    btnPrimitive.setExpanded(true);
    assert.equal(el.getAttribute('aria-expanded'), 'true');
    btnPrimitive.setExpanded(false);
    assert.equal(el.getAttribute('aria-expanded'), 'false');

    // Dynamic disabled state update
    btnPrimitive.setDisabled(true);
    assert.equal(el.getAttribute('aria-disabled'), 'true');
    assert.equal(el.getAttribute('tabindex'), '-1');

    clicked = false;
    el.click();
    assert.equal(clicked, false, 'Disabled button should not fire onClick handler');

    document.body.removeChild(el);
});

test('AccessibleDialog focus trap, escape key, and focus restoration', () => {
    let closed = false;
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    assert.equal(document.activeElement, trigger);

    const dialogPrimitive = new AccessibleDialog({
        title: 'Material Inspector',
        isOpen: false,
        onClose: () => { closed = true; }
    });

    const overlay = dialogPrimitive.getOverlayElement();
    document.body.appendChild(overlay);

    // Add interactive controls inside dialog
    const innerBtn1 = new AccessibleButton({ label: 'Cancel', onClick: () => {} }).getElement();
    const innerBtn2 = new AccessibleButton({ label: 'Confirm', onClick: () => {} }).getElement();
    dialogPrimitive.appendChild(innerBtn1);
    dialogPrimitive.appendChild(innerBtn2);

    // Open dialog and verify attributes
    dialogPrimitive.open();
    const dialogEl = dialogPrimitive.getDialogElement();
    assert.equal(dialogEl.getAttribute('role'), 'dialog');
    assert.equal(dialogEl.getAttribute('aria-modal'), 'true');
    assert.ok(dialogEl.getAttribute('aria-labelledby'));

    // Verify focus moved inside dialog
    assert.equal(document.activeElement, innerBtn1);

    // Test Escape key dismissal
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);
    assert.equal(closed, true);

    // Focus restoration check
    assert.equal(document.activeElement, trigger, 'Focus should be restored to trigger button after dialog close');

    document.body.removeChild(overlay);
});

test('AccessibleSlider keyboard navigation and ARIA value updates', () => {
    let lastValue = 0.5;
    const sliderPrimitive = new AccessibleSlider({
        ariaLabel: 'Roughness',
        value: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.1,
        onChange: (v) => { lastValue = v; }
    });

    const el = sliderPrimitive.getElement();
    document.body.appendChild(el);

    assert.equal(el.getAttribute('role'), 'slider');
    assert.equal(el.getAttribute('aria-valuenow'), '0.5');
    assert.equal(el.getAttribute('aria-valuemin'), '0');
    assert.equal(el.getAttribute('aria-valuemax'), '1');

    // Test ArrowRight key step increase
    const arrowRight = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
    el.dispatchEvent(arrowRight);
    assert.equal(lastValue, 0.6);
    assert.equal(el.getAttribute('aria-valuenow'), '0.6');

    // Test ArrowLeft key step decrease
    const arrowLeft = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true });
    el.dispatchEvent(arrowLeft);
    assert.equal(lastValue, 0.5);

    // Test Home key min jump
    const homeKey = new KeyboardEvent('keydown', { key: 'Home', bubbles: true });
    el.dispatchEvent(homeKey);
    assert.equal(lastValue, 0.0);

    // Test End key max jump
    const endKey = new KeyboardEvent('keydown', { key: 'End', bubbles: true });
    el.dispatchEvent(endKey);
    assert.equal(lastValue, 1.0);

    document.body.removeChild(el);
});

test('AccessibleBadge variant contrast and text updates', () => {
    const badgePrimitive = new AccessibleBadge({
        text: 'PBR Active',
        variant: 'success'
    });

    const el = badgePrimitive.getElement();
    assert.equal(el.getAttribute('role'), 'status');
    assert.equal(el.getAttribute('aria-label'), 'PBR Active');

    badgePrimitive.setText('PBR Disabled');
    assert.equal(el.textContent, 'PBR Disabled');
    assert.equal(el.getAttribute('aria-label'), 'PBR Disabled');
});

test('MeshAssetDecoder accessibilityProps adapter extension', () => {
    const accessProps = {
        ariaLabel: 'Specular Material Slot',
        role: 'region'
    };

    const mat = MeshAssetDecoder.createGLTFMaterial(
        AlphaMode.OPAQUE,
        0.5,
        false,
        [],
        accessProps
    );

    assert.deepEqual(mat.accessibilityProps, accessProps);

    const block = MeshAssetDecoder.createMeshBlock(
        DetailLevel.HIGH,
        [],
        [],
        [],
        [],
        accessProps
    );

    assert.deepEqual(block.accessibilityProps, accessProps);
});
