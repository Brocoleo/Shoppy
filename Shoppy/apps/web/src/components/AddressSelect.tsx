"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from "react";

type Props = {
  id: string;
  name: string;
  value: string;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/** A controlled listbox: no operating-system popup to lose focus in embedded browsers. */
export const AddressSelect = forwardRef<HTMLButtonElement, Props>(function AddressSelect(
  { id, name, value, options, placeholder, disabled, invalid, describedBy, onChange, onBlur }, ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const search = useRef({ text: "", at: 0 });
  const selected = options.indexOf(value);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  useEffect(() => {
    if (expanded) root.current?.querySelector(`[id="${id}-option-${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, id]);

  function show(index = selected >= 0 ? selected : 0) {
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds) setAbove(window.innerHeight - bounds.bottom < 200 && bounds.top > window.innerHeight - bounds.bottom);
    setActive(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  }

  function choose(index: number) {
    const next = options[index];
    if (next === undefined) return;
    if (next !== value) onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Escape") {
      if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") { if (expanded) choose(active); else show(); }
      else if (event.key === "Home") show(0);
      else if (event.key === "End") show(options.length - 1);
      else if (!expanded) show(event.key === "ArrowUp" ? options.length - 1 : selected >= 0 ? selected : 0);
      else setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      search.current.text = (now - search.current.at > 700 ? "" : search.current.text) + event.key;
      search.current.at = now;
      const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const index = options.findIndex((option) => normalize(option).startsWith(normalize(search.current.text)));
      if (index >= 0) { event.preventDefault(); show(index); }
    }
  }

  return (
    <div ref={root} className="relative min-w-0" onBlur={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
        onBlur();
      }
    }}>
      <button
        ref={(element) => { trigger.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }}
        id={id} name={name} value={value} type="button" role="combobox" aria-haspopup="listbox"
        aria-labelledby={`${id}-label`} aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined}
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={disabled}
        onKeyDown={keyDown} onClick={() => { if (expanded) setOpen(false); else show(); }}
        className="flex min-h-11 w-full items-center justify-between gap-3 border border-carbon/30 bg-ivory px-3 py-2 text-left disabled:bg-carbon/5 disabled:text-muted"
      >
        <span className="min-w-0 break-words">{value ? selected >= 0 ? value : `Guardada: ${value} — selecciona una opción` : placeholder}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d={expanded ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {expanded ? (
        <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}
          className={`absolute inset-x-0 z-50 max-h-[min(16rem,40vh)] overflow-y-auto overscroll-contain border border-carbon/30 bg-ivory p-1 shadow-lg ${above ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {options.map((option, index) => (
            <button type="button" role="option" aria-selected={value === option} id={`${id}-option-${index}`} key={option} tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}
              className={`block min-h-11 w-full break-words px-3 py-2 text-left ${active === index ? "bg-carbon text-ivory" : "text-carbon hover:bg-carbon/10"}`}>
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
