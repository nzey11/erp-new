/**
 * Party Notes Card
 *
 * Displays notes for a party.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

interface PartyNotesCardProps {
  notes: string;
}

export function PartyNotesCard({ notes }: PartyNotesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Заметки
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap">{notes}</p>
      </CardContent>
    </Card>
  );
}
