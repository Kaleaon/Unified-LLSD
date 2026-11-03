/**
 * Accessible Badge Component Primitive.
 */

import {
    IAccessibleControlProps,
    applyAccessibilityProps
} from './AccessibleControl.js';
import {
    DESIGN_TOKENS,
    verifyContrastRatio,
    calculateContrastRatio
} from '../tokens/colorTokens.js';

export interface IAccessibleBadgeProps extends IAccessibleControlProps {
    text: string;
    variant?: 'info' | 'success' | 'warning' | 'error' | 'default';
    contrastRatio?: number;
}

export class AccessibleBadge {
    private props: IAccessibleBadgeProps;
    private element: HTMLSpanElement;

    constructor(props: IAccessibleBadgeProps) {
        this.props = {
            ...props,
            variant: props.variant || 'default',
            ariaLabel: props.ariaLabel || (props.ariaLabelledBy ? undefined : props.text)
        };

        this.element = this.render();
    }

    private render(): HTMLSpanElement {
        const doc = globalThis.document;
        if (!doc) {
            throw new Error('DOM document is unavailable in current environment.');
        }

        const badge = doc.createElement('span');
        badge.textContent = this.props.text;

        applyAccessibilityProps(badge, this.props, 'status');

        const variant = this.props.variant || 'default';
        const tokens = DESIGN_TOKENS.badge[variant];
        const minContrast = this.props.contrastRatio ?? 4.5;

        const passes = verifyContrastRatio(tokens.foreground, tokens.background, minContrast);
        if (!passes) {
            const actualRatio = calculateContrastRatio(tokens.foreground, tokens.background);
            throw new Error(
                `[AccessibleBadge] WCAG 1.4.3 Violation: Contrast ratio ${actualRatio}:1 is below required minimum ${minContrast}:1`
            );
        }

        badge.style.display = 'inline-block';
        badge.style.padding = '4px 8px';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = '600';
        badge.style.borderRadius = '4px';
        badge.style.color = tokens.foreground;
        badge.style.backgroundColor = tokens.background;
        if (tokens.border) {
            badge.style.border = `1px solid ${tokens.border}`;
        }

        return badge;
    }

    public getElement(): HTMLSpanElement {
        return this.element;
    }

    public setText(text: string): void {
        this.props.text = text;
        this.element.textContent = text;
        if (!this.props.ariaLabelledBy) {
            this.element.setAttribute('aria-label', text);
        }
    }
}
