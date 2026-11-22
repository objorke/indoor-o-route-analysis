"use client"

import { useState, useEffect } from "react";
import { X, Clock, Database, Trash2, Zap, FlaskConical, PenTool, Pickaxe, Info, Route, GitBranch, Sun, SunMoon, Moon, Palette, CircleDot, Layers, Edit3, Library, Plus, RotateCcw, Eraser, HardDrive, type LucideIcon } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { Switch } from "@indoor-o-route-analysis/ui";
import { Input } from "@indoor-o-route-analysis/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@indoor-o-route-analysis/ui";
import { getCacheSize, clearCache, clearAllUserData } from "@indoor-o-route-analysis/core/storage";
import {
  getRouteEnumerationAlgorithmInfo,
  isRouteEnumerationAlgorithm,
  ROUTE_ENUMERATION_ALGORITHMS,
  type RouteEnumerationAlgorithm,
  normalizeRepositoryUrl,
  repositoryLabel,
  DEFAULT_EXAMPLE_REPOSITORY_URL,
} from "@indoor-o-route-analysis/core";
import { useFeatureFlags, useSettings, resetFeatureFlags, type FeatureFlags, type ThemeMode } from "@indoor-o-route-analysis/ui";
import { notify, confirmAction } from "@indoor-o-route-analysis/ui";

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "medium", label: "Medium", icon: SunMoon },
  { id: "dark", label: "Dark", icon: Moon },
];
import SettingsInfoDialog from "@/components/settings-info-dialog";


/** Feature flags in the Features tab, in the same order as the views in the top bar. */
const FEATURE_FLAG_ITEMS: { flag: keyof FeatureFlags; icon: LucideIcon; title: string; description: string }[] = [
  { flag: "directions", icon: Layers, title: "Directions", description: "Draw ISInOM directions and course print symbols, and show them in the map views" },
  { flag: "courseSetting", icon: Edit3, title: "Course Setting", description: "Plan courses on the map: place controls and build courses" },
  { flag: "routeBuilder", icon: PenTool, title: "Route Builder", description: "Manual route drawing tool" },
  { flag: "labs", icon: FlaskConical, title: "Labs", description: "Experimental features" },
  { flag: "modifyGraph", icon: Pickaxe, title: "Modify Graph", description: "Graph modification tools" },
];
interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  autoSaveEnabled: boolean;
  onAutoSaveChange: (checked: boolean) => void;
  persistToDB: boolean;
  onPersistToDBChange: (checked: boolean) => void;
  runningSpeed: number;
  onRunningSpeedChange: (speed: number) => void;
  routeAnalysisK: number;
  onRouteAnalysisKChange: (k: number) => void;
  routeEnumerationAlgorithm: RouteEnumerationAlgorithm;
  onRouteEnumerationAlgorithmChange: (algorithm: RouteEnumerationAlgorithm) => void;
}

type SettingsTab = "general" | "rendering" | "features" | "analysis" | "examples";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "rendering", label: "Rendering" },
  { id: "features", label: "Features" },
  { id: "analysis", label: "Analysis" },
  { id: "examples", label: "Examples" },
];

export default function SettingsDialog({
  isOpen,
  onClose,
  autoSaveEnabled,
  onAutoSaveChange,
  persistToDB,
  onPersistToDBChange,
  runningSpeed,
  onRunningSpeedChange,
  routeAnalysisK,
  onRouteAnalysisKChange,
  routeEnumerationAlgorithm,
  onRouteEnumerationAlgorithmChange,
}: SettingsDialogProps) {
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const { flags, updateFlag } = useFeatureFlags();
  const {
    theme, setTheme, showControlPoints, setShowControlPoints,
    exampleRepositories, setExampleRepositories, resetSettings,
  } = useSettings();
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const newRepoValid = normalizeRepositoryUrl(newRepoUrl) !== null;

  const addRepository = () => {
    const url = normalizeRepositoryUrl(newRepoUrl);
    if (!url) return;
    if (exampleRepositories.includes(url)) {
      notify("Repository is already in the list", { kind: "info" });
      return;
    }
    setExampleRepositories([...exampleRepositories, url]);
    setNewRepoUrl("");
  };

  const handleRestoreDefaults = async () => {
    if (await confirmAction("Restore all settings and feature flags to their defaults? Your events are kept.", { title: "Restore defaults", confirmLabel: "Restore" })) {
      resetSettings();
      resetFeatureFlags();
      onAutoSaveChange(false);
      notify("Settings restored to defaults", { kind: "success" });
    }
  };

  const handleClearAllData = async () => {
    if (await confirmAction(
      "Delete all events, maps, recent files and settings stored in this browser? Save any events you want to keep to file first. This cannot be undone.",
      { title: "Clear all user data", confirmLabel: "Delete everything", destructive: true },
    )) {
      try {
        await clearAllUserData();
        window.location.reload();
      } catch (error) {
        console.error("Failed to clear user data:", error);
        notify("Failed to clear user data", { kind: "error" });
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      getCacheSize().then(setCacheSize).catch(console.error);
    }
  }, [isOpen]);

  const handleClearCache = async () => {
    if (await confirmAction("Clear the map cache? Maps will need to be reloaded.", { title: "Clear map cache", confirmLabel: "Clear", destructive: true })) {
      try {
        await clearCache();
        setCacheSize(0);
      } catch (error) {
        console.error("Failed to clear cache:", error);
        notify("Failed to clear cache", { kind: "error" });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      {/* Fixed size, so the dialog doesn't change size between tabs; long tabs scroll inside */}
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl h-[36rem] max-h-[90vh] mx-4 shadow-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="text-md font-semibold">Settings</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowInfoDialog(true)} title="Show settings guide">
              <Info className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
              title="Close"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0" role="tablist">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "general" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Theme</span>
                <span className="text-xs text-muted-foreground">Light, medium or dark interface</span>
              </div>
            </div>
            <div className="flex rounded-md border border-border overflow-hidden" role="radiogroup" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={theme === opt.id}
                  title={`${opt.label} theme`}
                  onClick={() => setTheme(opt.id)}
                  className={`h-7 w-8 flex items-center justify-center transition-colors ${
                    theme === opt.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <opt.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>


          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Auto-save</span>
                <span className="text-xs text-muted-foreground">Save to file every 5 minutes</span>
              </div>
            </div>
            <Switch checked={autoSaveEnabled} onCheckedChange={onAutoSaveChange} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Persist locally</span>
                <span className="text-xs text-muted-foreground">Save changes to browser storage</span>
              </div>
            </div>
            <Switch checked={persistToDB} onCheckedChange={onPersistToDBChange} />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Map cache</span>
                <span className="text-xs text-muted-foreground">
                  {cacheSize !== null ? `${(cacheSize / 1024 / 1024).toFixed(2)} MB of map files; reloaded when needed` : "Calculating..."}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearCache} className="text-xs h-7 px-2" title="Clear the map cache">
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Restore defaults</span>
                <span className="text-xs text-muted-foreground">Reset all settings and feature flags; events are kept</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRestoreDefaults} className="text-xs h-7 px-2" title="Restore all settings to defaults">
              <RotateCcw className="h-3 w-3 mr-1" />
              Restore
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Eraser className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Clear all user data</span>
                <span className="text-xs text-muted-foreground">Delete all events, maps, recent files and settings in this browser</span>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={handleClearAllData} className="text-xs h-7 px-2" title="Delete all data stored in this browser">
              <Eraser className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          </div>
        </div>
        )}

        {activeTab === "rendering" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CircleDot className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Controls with focus point</span>
                <span className="text-xs text-muted-foreground">Dot at the exact centre of each control circle, in all map views</span>
              </div>
            </div>
            <Switch checked={showControlPoints} onCheckedChange={setShowControlPoints} aria-label="Controls with focus point" />
          </div>
        </div>
        )}
        {activeTab === "features" && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground mb-4">
            Enable or disable experimental features. Changes take effect immediately.
          </p>

          {FEATURE_FLAG_ITEMS.map(({ flag, icon: Icon, title, description }) => (
            <div key={flag} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{title}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </div>
              </div>
              <Switch checked={flags[flag]} onCheckedChange={(checked) => updateFlag(flag, checked)} aria-label={title} />
            </div>
          ))}
        </div>
        )}
        {activeTab === "analysis" && (
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Find all routes algorithm</span>
                <span className="text-xs text-muted-foreground">
                  Used by &quot;Show all routes&quot; in Route Analysis
                </span>
              </div>
            </div>
            <Select
              value={routeEnumerationAlgorithm}
              onValueChange={(value) => {
                if (isRouteEnumerationAlgorithm(value)) {
                  onRouteEnumerationAlgorithmChange(value);
                }
              }}
            >
              <SelectTrigger className="h-7 w-full text-xs" title="Algorithm used to enumerate all routes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUTE_ENUMERATION_ALGORITHMS.map((algorithm) => (
                  <SelectItem key={algorithm.id} value={algorithm.id} className="text-xs">
                    {algorithm.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {getRouteEnumerationAlgorithmInfo(routeEnumerationAlgorithm).detail}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Route className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span>Max routes (k)</span>
                <span className="text-xs text-muted-foreground">Alternative routes per leg</span>
              </div>
            </div>
            <Input
              type="number"
              min="1"
              max="1000"
              step="1"
              className="h-7 w-20 text-right"
              value={routeAnalysisK}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 1000) {
                  onRouteAnalysisKChange(val);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="whitespace-nowrap">Running Speed</span>
                <span className="text-xs text-muted-foreground">Used for time estimations</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="h-7 w-20 text-right"
                    value={runningSpeed}
                    onChange={(e) => onRunningSpeedChange(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground w-6">m/s</span>
                </div>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {runningSpeed > 0
                    ? (() => {
                        const secPerKm = 1000 / runningSpeed;
                        const m = Math.floor(secPerKm / 60);
                        const s = Math.round(secPerKm % 60);
                        return `${m}:${s.toString().padStart(2, "0")} min/km`;
                      })()
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>
        )}
        {activeTab === "examples" && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Library className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span>Example repositories</span>
              <span className="text-xs text-muted-foreground">
                URLs of index.json files listed in File → Examples. Entry URLs may be relative to the index.
              </span>
            </div>
          </div>
          <ul className="space-y-1">
            {exampleRepositories.length === 0 && (
              <li className="text-xs text-muted-foreground px-2 py-1">No repositories — File → Examples is hidden.</li>
            )}
            {exampleRepositories.map((url) => (
              <li key={url} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium truncate">{repositoryLabel(url)}</span>
                  <span className="text-[10px] text-muted-foreground truncate" title={url}>{url}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Remove repository"
                  aria-label={`Remove repository ${url}`}
                  onClick={() => setExampleRepositories(exampleRepositories.filter((u) => u !== url))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addRepository();
            }}
          >
            <Input
              type="url"
              placeholder="https://…/index.json"
              className="h-7 text-xs flex-1"
              value={newRepoUrl}
              onChange={(e) => setNewRepoUrl(e.target.value)}
              aria-label="Repository index URL"
            />
            <Button type="submit" variant="ghost" size="icon" className="h-7 w-7" disabled={!newRepoValid} title="Add repository (Enter)">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          {!exampleRepositories.includes(DEFAULT_EXAMPLE_REPOSITORY_URL) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              title="Add the default repository (objorke/indoor-o-data) back"
              onClick={() => setExampleRepositories([DEFAULT_EXAMPLE_REPOSITORY_URL, ...exampleRepositories])}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Add default repository
            </Button>
          )}
        </div>
        )}
        </div>
      </div>
      <SettingsInfoDialog isOpen={showInfoDialog} onClose={() => setShowInfoDialog(false)} />
    </div>
  );
}
