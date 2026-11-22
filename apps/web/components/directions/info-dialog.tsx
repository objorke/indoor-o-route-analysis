"use client"

import { X } from "lucide-react";
import { Button, DIRECTION_SYMBOLS_LEGEND } from "./legend";
import { DIRECTION_TOOLS } from "./tools";

import { ToolIcon } from "./direction-symbol-icon";
/** Guide for the Directions view. Tools and shortcuts come from DIRECTION_TOOLS. */
export default function DirectionsInfoDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Directions guide"
        className="bg-background border border-border rounded-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h3 className="font-semibold">Directions</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-4 text-sm text-muted-foreground">
          <p>
            Draw directions and course print symbols on top of the venue map, following the ISInOM indoor map norm: uncrossable borders,
            out-of-bounds boundaries and areas, one-way passages (1771.1 one large arrow, 1771.2 line of arrows), compulsory crossings (1772), compulsory diagonal switches (1773) diagonal one-way switches (1774) and map flip points (1720). The directions are stored in the
            event file. Controls are shown faintly for orientation.
          </p>
          <div>
            <p className="font-medium text-foreground mb-1">Tools</p>
            <ul className="space-y-1.5 ml-2">
              {DIRECTION_TOOLS.map((t) => (
                <li key={t.id}>
                  <ToolIcon tool={t.id} className="inline h-4 w-4 mr-1 align-text-bottom" />
                  <strong>{t.label}</strong>{t.code && <> (ISInOM {t.code})</>} (<kbd>{t.shortcut}</kbd>) &mdash; {t.hint}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Symbols</p>
            {DIRECTION_SYMBOLS_LEGEND}
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Editing</p>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li>Select a symbol on the map or in the list. Drag it to move it; <kbd>Delete</kbd> removes it.</li>
              <li>A selected line, area or one-way passage shows its points: drag a point to move it, double-click a point to delete it, double-click the line to add a point.</li>
              <li><kbd>R</kbd> / <kbd>Shift+R</kbd> rotates the selected crossing or switch by 15° (for a one-way switch, this sets the direction of travel), or set the angle in the panel.</li>
              <li>One-way passages: choose a single arrow or a line of arrows before drawing, or change it in the panel.</li>
              <li>Every change can be undone with <kbd>Ctrl/Cmd+Z</kbd>.</li>
            </ul>
          </div>
<p className="text-xs italic">
            Symbol sizes follow ISInOM 3.1: given at 1:700 and enlarged proportionally for larger map scales (1:350 →
            200 %), never reduced for smaller scales. The map scale is set in Event → Map. Directions are behind a
            feature flag: turn them on in Settings → Features.
          </p>
        </div>
      </div>
    </div>
  );
}
