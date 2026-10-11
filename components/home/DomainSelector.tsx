"use client";

import type { SemanticDomainId } from "@/lib/catalog/semanticCatalog";

export interface DomainOption {
  readonly id: SemanticDomainId;
  readonly label: string;
  readonly description: string;
  readonly categoryCount: number;
}

interface DomainSelectorProps {
  domains: readonly DomainOption[];
  selectedDomainId: SemanticDomainId | null;
  onSelect: (domainId: SemanticDomainId) => void;
}

export default function DomainSelector({
  domains,
  selectedDomainId,
  onSelect,
}: DomainSelectorProps) {
  if (domains.length === 0) {
    return (
      <section
        aria-labelledby="domain-selector-heading"
        className="border-y border-[var(--border-subtle)] py-8"
      >
        <h2
          id="domain-selector-heading"
          className="font-bold text-4xl sm:text-5xl mb-4"
        >
          What are we guessing?
        </h2>
        <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-[var(--foreground-muted)]">
          Comparison categories are temporarily unavailable while their data
          sources are being verified. No category is enabled until its
          production data path is ready.
        </p>
      </section>
    );
  }

  return (
    <fieldset className="py-10">
      <legend
        id="domain-selector-heading"
        className="font-bold text-4xl sm:text-5xl mb-8"
      >
        What are we guessing?
      </legend>
      <div
        role="radiogroup"
        aria-labelledby="domain-selector-heading"
        className="flex flex-wrap gap-x-10 gap-y-4 sm:justify-between sm:gap-x-6"
      >
        {domains.map((domain) => {
          const selected = selectedDomainId === domain.id;
          return (
            <label
              key={domain.id}
              className="group inline-flex min-h-11 cursor-pointer items-center gap-2 text-left focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--focus-ring)]"
            >
              <input
                type="radio"
                name="semantic-domain"
                value={domain.id}
                checked={selected}
                onChange={() => onSelect(domain.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`relative flex size-4 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus-ring)] ${selected ? "border-[var(--accent-time-attack)] bg-transparent" : "border-white bg-transparent"}`}
              >
                {selected && (
                  <span className="size-2 rounded-full bg-[var(--accent-time-attack)]" />
                )}
              </span>
              <span
                className={`text-2xl sm:text-4xl font-bold leading-tight text-[var(--foreground-inverse)] transition-[text-shadow,color] [-webkit-text-stroke:1px_var(--border-strong)] ${selected ? "[text-shadow:2px_2px_0_var(--accent-time-attack)]" : "group-hover:[text-shadow:2px_2px_0_var(--accent-classic)]"}`}
              >
                {domain.label}
              </span>
              <span className="sr-only">
                {domain.categoryCount} available categories
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
