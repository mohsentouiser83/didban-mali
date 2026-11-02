import { LearningView } from "@/components/workspace/learning-view";
export default function Page() {
  return (
    <div className="motion-safe:animate-page-reveal">
      <LearningView />
    </div>
  );
}
