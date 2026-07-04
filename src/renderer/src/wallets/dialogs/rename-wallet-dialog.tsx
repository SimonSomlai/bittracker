import { useEffect, useState } from "react";
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

interface RenameWalletDialogProps {
  open: boolean;
  walletId: number | null;
  currentName: string;
  onOpenChange: (open: boolean) => void;
  onRenamed: (previousName: string, nextName: string) => void;
}

export function RenameWalletDialog({
  open,
  walletId,
  currentName,
  onOpenChange,
  onRenamed,
}: RenameWalletDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName(currentName);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (walletId == null) return;

    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Wallet name is required" });
      return;
    }
    if (trimmed === currentName) {
      handleOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      const result = await getBittrackApi().renameWallet(walletId, trimmed);
      if (!result.ok) {
        toast({ title: "Rename failed", description: result.error });
        return;
      }
      onRenamed(currentName, trimmed);
      handleOpenChange(false);
      toast({ title: "Wallet renamed", description: trimmed });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="window-no-drag sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename wallet</DialogTitle>
          <DialogDescription>
            Update the display name for this wallet across transactions and charts.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="wallet-rename">Wallet name</Label>
            <Input
              id="wallet-rename"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
