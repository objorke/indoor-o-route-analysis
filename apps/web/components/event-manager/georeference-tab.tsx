import { Label, NumericInput } from "@indoor-o-route-analysis/ui";
import { FieldHelp } from "@/components/field-help";
import { MAP_TAB_HELP } from "./map-tab-help";

interface GeoreferenceTabProps {
  hasMap: boolean;
  latitudeInput: number;
  longitudeInput: number;
  commitGeo: (geo: { latitude?: number; longitude?: number }) => void;
}

/** Event → Georeference: latitude/longitude of the map's top-left corner. */
export function GeoreferenceTab({ hasMap, latitudeInput, longitudeInput, commitGeo }: GeoreferenceTabProps) {
  if (!hasMap) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 h-full text-sm text-muted-foreground">
        Import a map in the Map tab first.
      </div>
    );
  }
  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-md space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          Map georeferencing (top-left) <FieldHelp>{MAP_TAB_HELP.georef}</FieldHelp>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="lat" className="text-[10px] text-muted-foreground">Latitude</Label>
            <NumericInput
              id="lat"
              className="h-7 text-xs"
              min={-90}
              max={90}
              decimals={7}
              value={latitudeInput}
              onCommit={(v) => commitGeo({ latitude: v })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lon" className="text-[10px] text-muted-foreground">Longitude</Label>
            <NumericInput
              id="lon"
              className="h-7 text-xs"
              min={-180}
              max={180}
              decimals={7}
              value={longitudeInput}
              onCommit={(v) => commitGeo({ longitude: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
