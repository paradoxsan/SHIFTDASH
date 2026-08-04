import { PageHeader } from "@/components/ui";
import { UnderConstruction } from "@/components/shell/under-construction";

export default function SystemPage() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader title="חדר מכונות" subtitle="מה קורה מתחת למכסה" />
      <UnderConstruction
        what="טאבים: אוטומציות n8n והפעלה/כיבוי, פיד ריצות ושגיאות, סייר דאטהבייס, הקמת בוט חדש, ואנליטיקת שירות."
        phase="שלב 5"
      />
    </div>
  );
}
