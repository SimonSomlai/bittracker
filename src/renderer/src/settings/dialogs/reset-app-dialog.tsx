import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { getBittrackApi } from "@/utils/bittrack-client";

interface ResetAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetAppDialog({ open, onOpenChange }: ResetAppDialogProps) {
  const { toast } = useToast();
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmation("");
    }
    onOpenChange(nextOpen);
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await getBittrackApi().resetApp(confirmation);
      if (!result.ok) {
        toast({ title: "Reset failed", description: result.error });
        return;
      }
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="window-no-drag sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset BitTracker?</DialogTitle>
          <DialogDescription>
            This deletes all your BitTracker data and settings - You can always re-add your wallets
            and transactions later.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleReset}>
          <div className="space-y-2">
            <Label htmlFor="reset-confirmation">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="reset-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={submitting || confirmation !== "DELETE"}
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? "Resetting…" : "Reset app"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
