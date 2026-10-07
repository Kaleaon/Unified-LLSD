import {
    AccessibleButton,
    AccessibleDialog,
    AccessibleSlider,
    AccessibleBadge
} from '../index.js';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const dom = new JSDOM('<!DOCTYPE html><html><head><style>body { font-family: system-ui, sans-serif; background: #f8f9fa; margin: 0; padding: 32px; color: #111; } .card { background: white; border: 1px solid #ccc; border-radius: 8px; padding: 24px; max-width: 600px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 24px; } .row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; } label { font-weight: 600; min-width: 120px; }</style></head><body><div id="root"></div></body></html>', {
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

const root = document.getElementById('root')!;

// Title & Badges
const header = document.createElement('h1');
header.textContent = '3D Asset Inspector - WCAG 2.2 AA Accessible Primitives';
root.appendChild(header);

const card = document.createElement('div');
card.className = 'card';

const badgeRow = document.createElement('div');
badgeRow.className = 'row';
badgeRow.appendChild(new AccessibleBadge({ text: 'PBR Material', variant: 'info' }).getElement());
badgeRow.appendChild(new AccessibleBadge({ text: '100% WCAG AA', variant: 'success' }).getElement());
badgeRow.appendChild(new AccessibleBadge({ text: 'High LOD', variant: 'default' }).getElement());
card.appendChild(badgeRow);

// Slider 1: Roughness
const sliderRow1 = document.createElement('div');
sliderRow1.className = 'row';
const label1 = document.createElement('label');
label1.id = 'roughness-lbl';
label1.textContent = 'Roughness:';
sliderRow1.appendChild(label1);
const slider1 = new AccessibleSlider({
    ariaLabelledBy: 'roughness-lbl',
    value: 0.45,
    min: 0.0,
    max: 1.0,
    step: 0.05,
    onChange: () => {}
}).getElement();
slider1.style.flex = '1';
sliderRow1.appendChild(slider1);
card.appendChild(sliderRow1);

// Slider 2: Metallic
const sliderRow2 = document.createElement('div');
sliderRow2.className = 'row';
const label2 = document.createElement('label');
label2.id = 'metallic-lbl';
label2.textContent = 'Metallic:';
sliderRow2.appendChild(label2);
const slider2 = new AccessibleSlider({
    ariaLabelledBy: 'metallic-lbl',
    value: 0.8,
    min: 0.0,
    max: 1.0,
    step: 0.05,
    onChange: () => {}
}).getElement();
slider2.style.flex = '1';
sliderRow2.appendChild(slider2);
card.appendChild(sliderRow2);

// Buttons
const btnRow = document.createElement('div');
btnRow.className = 'row';
btnRow.style.marginTop = '24px';

const primaryBtn = new AccessibleButton({
    label: 'Inspect Material Properties',
    ariaLabel: 'Inspect material properties dialog',
    onClick: () => {}
}).getElement();
primaryBtn.style.padding = '8px 16px';
primaryBtn.style.borderRadius = '4px';
primaryBtn.style.cursor = 'pointer';

const disabledBtn = new AccessibleButton({
    label: 'Apply Shader Preset',
    ariaLabel: 'Apply shader preset',
    disabled: true,
    onClick: () => {}
}).getElement();
disabledBtn.style.padding = '8px 16px';
disabledBtn.style.borderRadius = '4px';

btnRow.appendChild(primaryBtn);
btnRow.appendChild(disabledBtn);
card.appendChild(btnRow);

root.appendChild(card);

// Dialog Demo
const dialog = new AccessibleDialog({
    title: 'Texture Maps Metadata',
    isOpen: true,
    onClose: () => {}
});

const dialogBody = dialog.getContentElement();
const p = document.createElement('p');
p.textContent = 'Albedo Map: 2048x2048 BC7, Normal Map: 2048x2048 BC5. Contrast ratio of all text exceeds 4.5:1 minimum requirement.';
dialogBody.appendChild(p);

const dialogCloseBtn = new AccessibleButton({
    label: 'Close Inspector',
    ariaLabel: 'Close texture inspector dialog',
    onClick: () => {}
}).getElement();
dialogCloseBtn.style.padding = '8px 16px';
dialogCloseBtn.style.borderRadius = '4px';
dialogCloseBtn.style.marginTop = '16px';
dialogBody.appendChild(dialogCloseBtn);

root.appendChild(dialog.getOverlayElement());

fs.writeFileSync('/tmp/accessible_demo.html', dom.serialize());
console.log('Successfully generated /tmp/accessible_demo.html');
