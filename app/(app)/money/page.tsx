import { PageHeader } from "@/components/ui";
import { UnderConstruction } from "@/components/shell/under-construction";

export default function MoneyPage() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader title="כסף" subtitle="הכנסות, הוצאות ורווח — מתוך Morning" />
      <UnderConstruction
        what="הכנסות מול הוצאות לפי חודש, רווח, חשבוניות פתוחות ובפיגור, והפרדה בין הקמות חד-פעמיות לדמי תחזוקה חודשיים."
        phase="שלב 3"
      />
    </div>
  );
}
