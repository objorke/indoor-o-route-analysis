import { useRef, useState } from "react";
import { ImageDown, ImagePlus, Loader2, X } from "lucide-react";
import { Button, Input } from "@indoor-o-route-analysis/ui";
import { Label } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { NO, SE } from 'country-flag-icons/react/3x2';
import { safeHttpUrl } from "@/components/shared";
import { embedImageFromUrl, formatDataUrlInfo, imageBlobToDataUrl, isDataUrl } from "@/lib/embed-image";
// import type { EventData } from "@indoor-o-route-analysis/core"; // Unused

interface EventPropertiesTabProps {
  titleInput: string;
  setTitleInput: (value: string) => void;
  handleTitleBlur: () => void;
  dateInput: string;
  setDateInput: (value: string) => void;
  handleDateBlur: () => void;
  eventUrlInput: string;
  setEventUrlInput: (value: string) => void;
  handleEventUrlBlur: () => void;
  eventImageUrlInput: string;
  setEventImageUrlInput: (value: string) => void;
  handleEventImageUrlBlur: () => void;
  /** Set and save the event image (URL or embedded data: URL) in one step. */
  commitEventImage: (value: string) => void;
  mapDownloadUrlInput: string;
  setMapDownloadUrlInput: (value: string) => void;
  handleMapDownloadUrlBlur: () => void;
  countryInput: string;
  handleCountryChange: (value: string) => void;
}

export function EventPropertiesTab({
  titleInput,
  setTitleInput,
  handleTitleBlur,
  dateInput,
  setDateInput,
  handleDateBlur,
  eventUrlInput,
  setEventUrlInput,
  handleEventUrlBlur,
  eventImageUrlInput,
  setEventImageUrlInput,
  handleEventImageUrlBlur,
  commitEventImage,
  mapDownloadUrlInput,
  setMapDownloadUrlInput,
  handleMapDownloadUrlBlur,
  countryInput,
  handleCountryChange,
}: EventPropertiesTabProps) {
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const isEmbedded = isDataUrl(eventImageUrlInput);
  const canEmbedFromUrl = !!safeHttpUrl(eventImageUrlInput);
  // Privacy: a remote image from an opened file is only fetched after a click (fetching reveals the
  // viewer's IP address to that host). Embedded images and addresses typed in this session show directly.
  const [allowedRemoteImage, setAllowedRemoteImage] = useState<string | null>(null);
  const showImage = isEmbedded || (!!eventImageUrlInput && allowedRemoteImage === eventImageUrlInput);
  const remoteHost = (() => {
    try {
      return new URL(eventImageUrlInput).host;
    } catch {
      return "";
    }
  })();

  const runEmbed = async (task: () => Promise<string>) => {
    setImageBusy(true);
    setImageError(null);
    try {
      commitEventImage(await task());
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err));
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex gap-8">
        <div className="flex-1 max-w-md space-y-4">
          <div>
            <Label htmlFor="event-title" className="text-xs text-muted-foreground">
              {"Title"}
            </Label>
            <Input
              id="event-title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-date" className="text-xs text-muted-foreground">
              {"Date (YYYY-MM-DD)"}
            </Label>
            <Input
              id="event-date"
              type="text"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onBlur={handleDateBlur}
              placeholder="YYYY-MM-DD"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-url" className="text-xs text-muted-foreground">
              {"Event website"}
            </Label>
            <Input
              id="event-url"
              type="url"
              value={eventUrlInput}
              onChange={(e) => setEventUrlInput(e.target.value)}
              onBlur={handleEventUrlBlur}
              placeholder="https://"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-image-url" className="text-xs text-muted-foreground">
              {"Event image"}
            </Label>
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void runEmbed(() => imageBlobToDataUrl(file));
              }}
            />
            <div className="flex gap-1 mt-1">
              {isEmbedded ? (
                <div
                  id="event-image-url"
                  className="flex-1 h-9 px-3 flex items-center rounded-md border border-input text-xs text-muted-foreground"
                  title="The image is stored inside the event file"
                >
                  Embedded image ({formatDataUrlInfo(eventImageUrlInput)})
                </div>
              ) : (
                <Input
                  id="event-image-url"
                  type="url"
                  value={eventImageUrlInput}
                  onChange={(e) => setEventImageUrlInput(e.target.value)}
                  onBlur={() => {
                    setAllowedRemoteImage(eventImageUrlInput); // the user's own address
                    handleEventImageUrlBlur();
                  }}
                  placeholder="https://"
                />
              )}
              {!isEmbedded && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!canEmbedFromUrl || imageBusy}
                  onClick={() => void runEmbed(() => embedImageFromUrl(eventImageUrlInput))}
                  title="Embed: download the image from this address and store it in the event file"
                  aria-label="Embed image from URL"
                >
                  {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={imageBusy}
                onClick={() => imageFileRef.current?.click()}
                title="Choose an image file and store it in the event file (large images are downscaled)"
                aria-label="Choose image file"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              {isEmbedded && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => commitEventImage("")}
                  title="Remove the embedded image"
                  aria-label="Remove embedded image"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {imageError && <p className="text-[11px] text-destructive mt-1">{imageError}</p>}
          </div>

          <div>
            <Label htmlFor="map-download-url" className="text-xs text-muted-foreground">
              {"Event maps download site"}
            </Label>
            <Input
              id="map-download-url"
              type="url"
              value={mapDownloadUrlInput}
              onChange={(e) => setMapDownloadUrlInput(e.target.value)}
              onBlur={handleMapDownloadUrlBlur}
              placeholder="https://"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="event-country" className="text-xs text-muted-foreground">
              {"Country"}
            </Label>
            <Select value={countryInput || "none"} onValueChange={handleCountryChange}>
              <SelectTrigger id="event-country" className="mt-1">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{"None"}</SelectItem>
                <SelectItem value="norway">
                  <span className="flex items-center gap-2">
                    <NO {...{ className: "w-5", title: "Norway" } as Record<string, string>} />
                    <span>Norway</span>
                  </span>
                </SelectItem>
                <SelectItem value="sweden">
                  <span className="flex items-center gap-2">
                    <SE {...{ className: "w-5", title: "Sweden" } as Record<string, string>} />
                    <span>Sweden</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(eventImageUrlInput || eventUrlInput || mapDownloadUrlInput) && (
          <div className="flex-1 max-w-sm">
            {eventImageUrlInput && !showImage && (
              <button
                type="button"
                className="w-full border border-dashed rounded-md p-4 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30"
                onClick={() => setAllowedRemoteImage(eventImageUrlInput)}
                title="Loading the image contacts that site, which can see your IP address"
              >
                Show image from {remoteHost || "the web"}
              </button>
            )}
            {showImage && (
              <>
                <div className="border rounded-md overflow-hidden bg-muted/20">
                  <img
                    referrerPolicy="no-referrer"
                    src={eventImageUrlInput}
                    alt="Event preview"
                    className="w-full h-auto object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </>
            )}
            <div className="mt-2 flex flex-col gap-1 text-sm">
              {safeHttpUrl(eventUrlInput) && (
                <a
                  href={safeHttpUrl(eventUrlInput)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  {"Event"}
                </a>
              )}
              {safeHttpUrl(mapDownloadUrlInput) && (
                <a
                  href={safeHttpUrl(mapDownloadUrlInput)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline block"
                >
                  {"Event maps"}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
