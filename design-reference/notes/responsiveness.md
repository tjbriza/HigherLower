# Responsive Implementation Guidance

No mobile, tablet, breakpoint-specific, or structural responsive layouts were supplied by the designer.

Therefore:

- Desktop Figma is the authoritative visual-design reference.
- Responsive behavior is implementation-defined.
- Use standard Tailwind mobile-first conventions and sensible layout reflow.
- Preserve hierarchy, semantic grouping, visual language, and interaction priority.
- Do not mechanically scale `1440px` absolute-position coordinates.
- Major responsive structural choices should be documented as implementation decisions, not attributed to Figma.
- Do not claim an intermediate/tablet design is designer-approved unless new evidence is supplied.

Current status:
- Desktop composition: Confirmed
- Mobile composition: Implementation-defined
- Tablet composition: Implementation-defined
- Exact breakpoints: Implementation-defined
