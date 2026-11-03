/**
 * Accessible Button Component Primitive.
 */

import {
    IAccessibleControlProps,
    validateAccessibilityProps,
    applyAccessibilityProps
} from './AccessibleControl.js';
import {
    DESIGN_TOKENS,
    verifyContrastRatio,
    calculateContrastRatio
} from '../tokens/colorTokens.js';

export interface IAccessibleButtonProps extends IAccessibleControlProps {
    label: string;
    onClick: (event: MouseEvent) => void;
    disabled?: boolean;
    contrastRatio?: number; // Minimum 4.5:1 ratio enforced
    expanded?: boolean;
}

export class AccessibleButton {
    private props: IAccessibleButtonProps;
    private element: HTMLButtonElement;

    constructor(props: IAccessibleButtonProps) {
        // Fall back ariaLabel to label if neither ariaLabel nor ariaLabelledBy is explicitly provided
        const effectiveProps: IAccessibleButtonProps = {
            ...props,
            ariaLabel: props.ariaLabel || (props.ariaLabelledBy ? undefined : props.label)
        };

        validateAccessibilityProps(effectiveProps, 'AccessibleButton');

        this.props = effectiveProps;
        this.element = this.render();
    }

    private render(): HTMLButtonElement {
        const doc = globalThis.document;
        if (!doc) {
            throw new Error('DOM document is unavailable in current environment.');
        }

        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = this.props.label;

        // Apply ARIA roles and labels
        applyAccessibilityProps(button, this.props, 'button');

        // Color & Contrast Verification (WCAG 1.4.3 Minimum 4.5:1)
        const minContrast = this.props.contrastRatio ?? 4.5;
        const tokens = this.props.disabled
            ? DESIGN_TOKENS.button.disabled
            : DESIGN_TOKENS.button.primary;

        const passes = verifyContrastRatio(tokens.foreground, tokens.background, minContrast);
        if (!passes) {
            const actualRatio = calculateContrastRatio(tokens.foreground, tokens.background);
            throw new Error(
                `[AccessibleButton] WCAG 1.4.3 Violation: Contrast ratio ${actualRatio}:1 is below required minimum ${minContrast}:1`
            );
        }

        button.style.color = tokens.foreground;
        button.style.backgroundColor = tokens.background;
        button.style.border = `1px solid ${tokens.border}`;

        // Focus & Interactive state
        this.updateDisabledState(button, !!this.props.disabled);
        this.updateExpandedState(button, this.props.expanded);

        // Click Handler
        button.addEventListener('click', (e: MouseEvent) => {
            if (this.props.disabled) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            this.props.onClick(e);
        });

        // Keyboard Event Handlers for WCAG 2.2 keyboard navigation (Enter & Space)
        button.addEventListener('keydown', (e: KeyboardEvent) => {
            if (this.props.disabled) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                button.click();
            }
        });

        return button;
    }

    public updateDisabledState(button: HTMLButtonElement = this.element, disabled: boolean): void {
        this.props.disabled = disabled;
        button.disabled = disabled;
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');

        if (disabled) {
            button.setAttribute('tabindex', '-1');
            const tokens = DESIGN_TOKENS.button.disabled;
            button.style.color = tokens.foreground;
            button.style.backgroundColor = tokens.background;
            button.style.border = `1px solid ${tokens.border}`;
        } else {
            const tabIdx = this.props.tabIndex !== undefined ? this.props.tabIndex : 0;
            button.setAttribute('tabindex', tabIdx.toString());
            const tokens = DESIGN_TOKENS.button.primary;
            button.style.color = tokens.foreground;
            button.style.backgroundColor = tokens.background;
            button.style.border = `1px solid ${tokens.border}`;
        }
    }

    public updateExpandedState(button: HTMLButtonElement = this.element, expanded?: boolean): void {
        this.props.expanded = expanded;
        if (expanded !== undefined) {
            button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        } else {
            button.removeAttribute('aria-expanded');
        }
    }

    public getElement(): HTMLButtonElement {
        return this.element;
    }

    public setDisabled(disabled: boolean): void {
        this.updateDisabledState(this.element, disabled);
    }

    public setExpanded(expanded: boolean): void {
        this.updateExpandedState(this.element, expanded);
    }
}
