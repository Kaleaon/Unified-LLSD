/**
 * Base Accessible Control Interfaces and ARIA Helper Utilities.
 */

export interface IAccessibleControlProps {
    ariaLabel?: string;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
    role?: string;
    tabIndex?: number;
}

export type RequireAccessibleLabel<T extends IAccessibleControlProps> = T & (
    | { ariaLabel: string; ariaLabelledBy?: string }
    | { ariaLabel?: string; ariaLabelledBy: string }
);

/**
 * Validates that mandatory accessibility properties (ariaLabel or ariaLabelledBy) are provided.
 * @throws Error if neither ariaLabel nor ariaLabelledBy is defined and non-empty.
 */
export function validateAccessibilityProps(
    props: IAccessibleControlProps,
    componentName: string = 'AccessibleControl'
): void {
    const hasLabel = props.ariaLabel && props.ariaLabel.trim().length > 0;
    const hasLabelledBy = props.ariaLabelledBy && props.ariaLabelledBy.trim().length > 0;

    if (!hasLabel && !hasLabelledBy) {
        throw new Error(
            `[${componentName}] WCAG 2.2 4.1.2 Violation: Interactive controls must specify either "ariaLabel" or "ariaLabelledBy".`
        );
    }
}

/**
 * Apply common ARIA and accessibility attributes to an HTML element.
 */
export function applyAccessibilityProps(
    element: HTMLElement,
    props: IAccessibleControlProps,
    defaultRole?: string
): void {
    const role = props.role || defaultRole;
    if (role) {
        element.setAttribute('role', role);
    }

    if (props.ariaLabel) {
        element.setAttribute('aria-label', props.ariaLabel);
    }

    if (props.ariaLabelledBy) {
        element.setAttribute('aria-labelledby', props.ariaLabelledBy);
    }

    if (props.ariaDescribedBy) {
        element.setAttribute('aria-describedby', props.ariaDescribedBy);
    }

    if (props.tabIndex !== undefined) {
        element.setAttribute('tabindex', props.tabIndex.toString());
    }
}
