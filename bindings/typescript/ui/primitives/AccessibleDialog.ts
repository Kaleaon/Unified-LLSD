/**
 * Accessible Dialog / Modal Component Primitive.
 */

import {
    IAccessibleControlProps,
    validateAccessibilityProps,
    applyAccessibilityProps
} from './AccessibleControl.js';
import { DESIGN_TOKENS } from '../tokens/colorTokens.js';

export interface IAccessibleDialogProps extends IAccessibleControlProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    initialFocusRef?: string | HTMLElement;
}

export class AccessibleDialog {
    private props: IAccessibleDialogProps;
    private overlayElement: HTMLDivElement;
    private dialogElement: HTMLDivElement;
    private titleElement: HTMLHeadingElement;
    private contentElement: HTMLDivElement;
    private previouslyFocusedElement: HTMLElement | null = null;
    private keydownListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(props: IAccessibleDialogProps) {
        const titleId = `dialog-title-${Math.random().toString(36).substring(2, 9)}`;
        const effectiveProps: IAccessibleDialogProps = {
            ...props,
            ariaLabelledBy: props.ariaLabelledBy || (props.ariaLabel ? undefined : titleId)
        };

        validateAccessibilityProps(effectiveProps, 'AccessibleDialog');

        this.props = effectiveProps;
        const { overlay, dialog, titleHeading, content } = this.render(titleId);
        this.overlayElement = overlay;
        this.dialogElement = dialog;
        this.titleElement = titleHeading;
        this.contentElement = content;

        if (this.props.isOpen) {
            this.open();
        } else {
            this.overlayElement.style.display = 'none';
        }
    }

    private render(titleId: string) {
        const doc = globalThis.document;
        if (!doc) {
            throw new Error('DOM document is unavailable in current environment.');
        }

        const overlay = doc.createElement('div');
        overlay.className = 'accessible-dialog-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = DESIGN_TOKENS.dialog.overlay;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '1000';

        const dialog = doc.createElement('div');
        dialog.className = 'accessible-dialog-content';
        dialog.style.backgroundColor = DESIGN_TOKENS.dialog.background;
        dialog.style.color = DESIGN_TOKENS.dialog.text;
        dialog.style.border = `1px solid ${DESIGN_TOKENS.dialog.border}`;
        dialog.style.padding = '24px';
        dialog.style.borderRadius = '8px';
        dialog.style.minWidth = '320px';
        dialog.style.maxWidth = '600px';
        dialog.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
        dialog.tabIndex = -1; // Allows dialog container to receive focus if no children exist

        applyAccessibilityProps(dialog, this.props, 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const titleHeading = doc.createElement('h2');
        titleHeading.id = titleId;
        titleHeading.textContent = this.props.title;
        titleHeading.style.marginTop = '0';
        titleHeading.style.marginBottom = '16px';
        titleHeading.style.color = DESIGN_TOKENS.dialog.text;

        const content = doc.createElement('div');
        content.className = 'accessible-dialog-body';

        dialog.appendChild(titleHeading);
        dialog.appendChild(content);
        overlay.appendChild(dialog);

        return { overlay, dialog, titleHeading, content };
    }

    public open(): void {
        const doc = globalThis.document;
        if (!doc) return;

        this.previouslyFocusedElement = doc.activeElement as HTMLElement;
        this.props.isOpen = true;
        this.overlayElement.style.display = 'flex';

        // Keyboard Listener for Focus Trapping & Escape key
        this.keydownListener = (e: KeyboardEvent) => this.handleKeyDown(e);
        doc.addEventListener('keydown', this.keydownListener);

        // Move focus inside dialog
        this.setInitialFocus();
    }

    public close(): void {
        const doc = globalThis.document;
        this.props.isOpen = false;
        this.overlayElement.style.display = 'none';

        if (this.keydownListener && doc) {
            doc.removeEventListener('keydown', this.keydownListener);
            this.keydownListener = null;
        }

        // Restore focus to pre-dialog active element (WCAG 2.2 Focus Restoration)
        if (this.previouslyFocusedElement && typeof this.previouslyFocusedElement.focus === 'function') {
            this.previouslyFocusedElement.focus();
        }

        this.props.onClose();
    }

    private setInitialFocus(): void {
        if (!this.dialogElement) return;

        if (this.props.initialFocusRef) {
            let target: HTMLElement | null = null;
            if (typeof this.props.initialFocusRef === 'string') {
                target = this.dialogElement.querySelector(this.props.initialFocusRef);
            } else if (this.props.initialFocusRef instanceof HTMLElement) {
                target = this.props.initialFocusRef;
            }
            if (target && typeof target.focus === 'function') {
                target.focus();
                return;
            }
        }

        const focusables = this.getFocusableElements();
        if (focusables.length > 0) {
            focusables[0].focus();
        } else if (typeof this.dialogElement.focus === 'function') {
            this.dialogElement.focus();
        }
    }

    private getFocusableElements(): HTMLElement[] {
        if (!this.dialogElement) return [];
        const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const elements = Array.from(this.dialogElement.querySelectorAll<HTMLElement>(selector));
        return elements.filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (!this.props.isOpen) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
            return;
        }

        if (e.key === 'Tab') {
            const focusables = this.getFocusableElements();
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }

            const doc = globalThis.document;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey) {
                if (doc && (doc.activeElement === first || doc.activeElement === this.dialogElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (doc && doc.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }

    public getOverlayElement(): HTMLDivElement {
        return this.overlayElement;
    }

    public getDialogElement(): HTMLDivElement {
        return this.dialogElement;
    }

    public getContentElement(): HTMLDivElement {
        return this.contentElement;
    }

    public appendChild(child: HTMLElement): void {
        this.contentElement.appendChild(child);
    }
}
