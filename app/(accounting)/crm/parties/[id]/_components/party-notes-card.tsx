/**
 * Party Notes Card
 *
 * Displays notes for a party.
 */

import { Card } from "antd";
import { FileText } from "lucide-react";

interface PartyNotesCardProps {
  notes: string;
}

export function PartyNotesCard({ notes }: PartyNotesCardProps) {
  return (
    <Card title={
      <span className="text-sm font-medium flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Заметки
      </span>
    }>
      <p className="text-sm whitespace-pre-wrap">{notes}</p>
    </Card>
  );
}
