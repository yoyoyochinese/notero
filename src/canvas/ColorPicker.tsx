// Swatch popover for JSON Canvas colours: presets "1"–"6", any hex via the native picker, or none.
import type { ReactNode } from "react";
import { colorOf } from "./cards";

const PRESETS = ["1", "2", "3", "4", "5", "6"];

export function ColorPicker({ label, value, onChange }: { label: ReactNode; value?: string; onChange: (color?: string) => void }) {
  // <details> gives the open/close toggle; picking closes it.
  const pick = (e: { currentTarget: Element }, color?: string) => {
    onChange(color);
    e.currentTarget.closest("details")?.removeAttribute("open");
  };
  return (
    <details className="color-picker">
      <summary>
        <span className="swatch-dot" style={{ background: colorOf(value) ?? "transparent" }} />
        {label}
      </summary>
      <div className="color-picker-menu">
        <button className="swatch none" title="Default" aria-label="Default colour" onClick={(e) => pick(e)} />
        {PRESETS.map((c) => (
          <button key={c} className="swatch" aria-pressed={value === c} style={{ background: colorOf(c) }} aria-label={`Colour ${c}`} onClick={(e) => pick(e, c)} />
        ))}
        <input
          type="color"
          title="Custom colour"
          value={value?.startsWith("#") ? value : "#242936"}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </details>
  );
}
