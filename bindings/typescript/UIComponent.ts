/**
 * Accessibility and UI Component Helpers for Second Life / OpenSim 3D Viewer Controls.
 * Compliance: WCAG 2.2 2.1.1 (Keyboard Control) & 2.4.7 (Focus Visible).
 */

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

/**
 * Replaces `outline: none` or `outline: 0` CSS rules with high-contrast visible focus indicators.
 */
export function sanitizeCSSFocusRules(css: string, focusRingColor: string = '#005fcc'): string {
    const replacement = `outline: 2px solid ${focusRingColor}; outline-offset: 2px;`;
    let sanitized = css.replace(/outline\s*:\s*(none|0)(\s*!important)?\s*;?/gi, replacement);
    if (!sanitized.includes(':focus-visible')) {
        sanitized += `\n${FOCUS_VISIBLE_CSS_RULE}`;
    }
    return sanitized;
}

/**
 * Applies high-contrast visible focus ring styling to a DOM element.
 */
export function applyFocusRingStyle(element: any, focusRingColor: string = '#005fcc'): void {
    if (!element) return;
    if (element.style) {
        element.style.outline = `2px solid ${focusRingColor}`;
        element.style.outlineOffset = '2px';
    }
}

/**
 * Binds `tabindex="0"` and keyboard event handlers (`Enter` and `Space`) to non-focusable interactive controls.
 * Ensures `event.preventDefault()` is called during `Space` key activations to prevent page scrolling.
 */
export function bindKeyboardHandlers(element: any, onClick: (evt?: any) => void, options: UIComponentOptions = {}): () => void {
    if (!element) return () => {};

    // Ensure interactive element is keyboard focusable
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

    // Return unbind function
    return () => {
        if (typeof element.removeEventListener === 'function') {
            element.removeEventListener('click', onClick);
            element.removeEventListener('keydown', handleKeyDown);
        }
    };
}

/**
 * Interactive UI Component wrapper for div, canvas, and custom viewer controls.
 */
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
