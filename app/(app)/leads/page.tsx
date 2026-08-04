import { PageHeader } from "@/components/ui";
import { UnderConstruction } from "@/components/shell/under-construction";

export default function LeadsPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader title="לידים" subtitle="ה-pipeline של Shift Digital" />
      <UnderConstruction
        what="LeadManager מגוגל שיטס בעיצוב החדש: פייפליין, תזכורות שמגיעות היום, כרטיס ליד ושליחת תבניות."
        phase="שלב 5"
      />
    </div>
  );
}
