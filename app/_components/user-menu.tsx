"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Globe, Moon, Settings, SlidersHorizontal, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectSettingsDialog } from "@/app/[projectId]/_components/project-settings-dialog";
import { AppSettingsDialog } from "./app-settings-dialog";
import { getSetupStatus } from "../settings-actions";
import type { ProjectSettings } from "@/lib/project-settings";

/**
 * projectId is passed only by the project rail layout, so the per-project
 * settings entry appears there and not in the workspace header.
 * initialSettings (layout-provided) lets the dialog open without refetching.
 * The local identity is supplied by the server.
 */
export function UserMenu({
  user: initialUser,
  projectId,
  initialSettings,
  projectName,
  projectDescription,
  resolvedDefaultFile,
}: {
  user?: { name?: string | null; email: string; image?: string | null };
  projectId?: string;
  initialSettings?: ProjectSettings;
  projectName?: string;
  projectDescription?: string;
  resolvedDefaultFile?: string;
}) {
  const { setTheme, theme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);

  const [missingSetup, setMissingSetup] = useState<string[]>([]);

  // The desktop app's Settings… menu item opens the same dialog.
  useEffect(() => window.beeblioDesktop?.onOpenSettings(() => setAppSettingsOpen(true)), []);

  // An installed app has no .env.local, so on first run the agent cannot work
  // until the required settings exist. The desktop app opens Settings by
  // itself, once per session so it does not reappear on every page; a browser
  // only shows the hint, since its user started from a configured checkout.
  useEffect(() => {
    let cancelled = false;
    void getSetupStatus()
      .then(({ missingRequired }) => {
        if (cancelled) return;
        setMissingSetup(missingRequired);
        if (missingRequired.length && window.beeblioDesktop && !wasPromptedThisSession()) setAppSettingsOpen(true);
      })
      .catch(() => {
        // The hint is a convenience; the agent reports missing settings itself.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = initialUser;
  if (!user) return null;

  const name = user.name || user.email;
  const initial = name ? name.charAt(0).toUpperCase() : <User className="h-4 w-4" />;
  const ThemeIcon = theme === "dark" ? Moon : Sun;

  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger aria-label={missingSetup.length ? "Open workspace menu (setup incomplete)" : "Open workspace menu"} className="workspace-rail-secondary relative flex size-9 items-center justify-center gap-2 rounded-lg text-xs font-medium text-muted-foreground outline-none ring-0 transition-colors hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/20">
          <Avatar className="size-7 cursor-pointer border border-border/80 shadow-[0_2px_8px_-4px_rgb(18_35_48/0.3)] transition-transform hover:-translate-y-0.5 active:translate-y-0">
            <AvatarImage src={user.image || ""} alt={name} />
            <AvatarFallback className="bg-primary/10 text-primary">{initial}</AvatarFallback>
          </Avatar>
          <span className="workspace-rail-label hidden min-w-0 truncate text-xs font-medium">{name}</span>
          {missingSetup.length ? <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500 ring-2 ring-background" aria-hidden="true" /> : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="w-56 animate-in slide-in-from-top-2"
        >
          {projectId ? (
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => setSettingsOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Project Settings</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setAppSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
            <span>{missingSetup.length ? "Finish setup" : "Settings"}</span>
            {missingSetup.length ? <span className="ml-auto size-2 rounded-full bg-amber-500" aria-hidden="true" /> : null}
          </DropdownMenuItem>
          <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5" role="group" aria-label="Theme">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <ThemeIcon className="size-4 text-muted-foreground" />
              Theme
            </span>
            <div className="flex items-center rounded-lg bg-muted/70 p-0.5">
              {[
                { value: "light", label: "Light", Icon: Sun },
                { value: "dark", label: "Dark", Icon: Moon },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={theme === value}
                  title={label}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTheme(value);
                  }}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-sm"
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="https://beeblio.raihankalla.id">
              <Globe className="size-4" />
              <span>Beeblio</span>
              <ArrowUpRight className="ml-auto size-4" aria-hidden="true" />
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AppSettingsDialog open={appSettingsOpen} onOpenChange={setAppSettingsOpen} onSaved={({ missingRequired }) => setMissingSetup(missingRequired)} />
      {projectId ? (
        <ProjectSettingsDialog
          projectId={projectId}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialSettings={initialSettings}
          initialName={projectName}
          initialDescription={projectDescription}
          resolvedDefaultFile={resolvedDefaultFile}
        />
      ) : null}
    </>
  );
}

const SETUP_PROMPT_KEY = "beeblio:setup-prompted";

/** Records the automatic prompt; storage can be unavailable, in which case it may show again. */
function wasPromptedThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SETUP_PROMPT_KEY)) return true;
    sessionStorage.setItem(SETUP_PROMPT_KEY, "1");
  } catch {
    // Private mode or blocked storage.
  }
  return false;
}
