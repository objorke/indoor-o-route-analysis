import AppShell from "@/components/app-shell";

export function generateStaticParams() {
  return [
    { screen: "event-manager" },
    { screen: "directions" },
    { screen: "course-setting" },
    { screen: "graph-editor" },
    { screen: "route-builder" },
    { screen: "route-analysis" },
    { screen: "event-analysis" },
    { screen: "labs" },
    { screen: "modify-graph" },
    { screen: "model-3d" },
  ];
}

export default function ScreenPage() {
  return <AppShell />;
}
