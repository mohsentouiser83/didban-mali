"use client";
import { GearMenu } from "@/components/ui/gear-menu";
import { useSettingsNavigation } from "@/hooks/use-settings-navigation";
export function SettingsMenu() {
  const view = useSettingsNavigation();
  return (
    <GearMenu
      open={view.open}
      onOpenChange={view.setOpen}
      pathname={view.pathname}
      query={view.query}
      onQueryChange={view.setQuery}
      categories={view.categories}
      results={view.results}
      onNavigate={view.navigate}
      onLogout={view.logout}
      username={view.workspace.user?.name}
      signingOut={view.signingOut}
    />
  );
}
