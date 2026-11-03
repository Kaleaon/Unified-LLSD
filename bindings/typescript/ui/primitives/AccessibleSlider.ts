/**
 * Accessible Slider Component Primitive.
 */

import {
    IAccessibleControlProps,
    validateAccessibilityProps,
    applyAccessibilityProps
} from './AccessibleControl.js';
import { DESIGN_TOKENS } from '../tokens/colorTokens.js';

export interface IAccessibleSliderProps extends IAccessibleControlProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    valueText?: string;
}

export class AccessibleSlider {
    private props: IAccessibleSliderProps;
    private element: HTMLInputElement;

    constructor(props: IAccessibleSliderProps) {
        validateAccessibilityProps(props, 'AccessibleSlider');
        this.props = {
            ...props,
            step: props.step ?? 1
        };

        this.element = this.render();
    }

    private render(): HTMLInputElement {
        const doc = globalThis.document;
        if (!doc) {
            throw new Error('DOM document is unavailable in current environment.');
        }

        const slider = doc.createElement('input');
        slider.type = 'range';
        slider.min = this.props.min.toString();
        slider.max = this.props.max.toString();
        slider.step = (this.props.step ?? 1).toString();
        slider.value = this.props.value.toString();

        applyAccessibilityProps(slider, this.props, 'slider');

        slider.style.accentColor = DESIGN_TOKENS.slider.thumb;
        slider.style.color = DESIGN_TOKENS.slider.text;

        this.updateAriaValueAttributes(slider, this.props.value);

        if (this.props.disabled) {
            slider.disabled = true;
            slider.setAttribute('aria-disabled', 'true');
            slider.setAttribute('tabindex', '-1');
        } else {
            const tabIdx = this.props.tabIndex !== undefined ? this.props.tabIndex : 0;
            slider.setAttribute('tabindex', tabIdx.toString());
        }

        // Handle direct input / change events
        slider.addEventListener('input', (e: Event) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.setValueInternal(val);
        });

        // Keyboard Navigation per WCAG 2.2 Slider Pattern
        slider.addEventListener('keydown', (e: KeyboardEvent) => {
            if (this.props.disabled) return;

            const step = this.props.step ?? 1;
            const bigStep = step * 10;
            let current = this.props.value;
            let handled = false;

            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowUp':
                    current = Math.min(this.props.max, current + step);
                    handled = true;
                    break;
                case 'ArrowLeft':
                case 'ArrowDown':
                    current = Math.max(this.props.min, current - step);
                    handled = true;
                    break;
                case 'PageUp':
                    current = Math.min(this.props.max, current + bigStep);
                    handled = true;
                    break;
                case 'PageDown':
                    current = Math.max(this.props.min, current - bigStep);
                    handled = true;
                    break;
                case 'Home':
                    current = this.props.min;
                    handled = true;
                    break;
                case 'End':
                    current = this.props.max;
                    handled = true;
                    break;
            }

            if (handled) {
                e.preventDefault();
                slider.value = current.toString();
                this.setValueInternal(current);
            }
        });

        return slider;
    }

    private setValueInternal(val: number): void {
        // Clean float precision
        const clamped = Math.max(this.props.min, Math.min(this.props.max, val));
        const decimals = this.getDecimalPlaces(this.props.step ?? 1);
        const rounded = parseFloat(clamped.toFixed(decimals));

        this.props.value = rounded;
        this.updateAriaValueAttributes(this.element, rounded);
        this.props.onChange(rounded);
    }

    private updateAriaValueAttributes(slider: HTMLInputElement, val: number): void {
        slider.setAttribute('aria-valuenow', val.toString());
        slider.setAttribute('aria-valuemin', this.props.min.toString());
        slider.setAttribute('aria-valuemax', this.props.max.toString());

        if (this.props.valueText) {
            slider.setAttribute('aria-valuetext', this.props.valueText);
        } else {
            slider.setAttribute('aria-valuetext', val.toString());
        }
    }

    private getDecimalPlaces(step: number): number {
        const str = step.toString();
        if (str.indexOf('.') !== -1) {
            return str.split('.')[1].length;
        }
        return 0;
    }

    public getElement(): HTMLInputElement {
        return this.element;
    }

    public getValue(): number {
        return this.props.value;
    }

    public setValue(val: number): void {
        this.element.value = val.toString();
        this.setValueInternal(val);
    }

    public setDisabled(disabled: boolean): void {
        this.props.disabled = disabled;
        this.element.disabled = disabled;
        this.element.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        this.element.setAttribute('tabindex', disabled ? '-1' : (this.props.tabIndex ?? 0).toString());
    }
}
