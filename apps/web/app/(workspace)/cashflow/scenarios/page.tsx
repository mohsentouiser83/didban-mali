import { ScenariosView } from "@/components/workspace/scenarios-view";
export default function Page() {
  return (
    <div className="motion-safe:animate-page-reveal">
      <ScenariosView />
    </div>
  );
}
