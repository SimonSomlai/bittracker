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
import { getBittrackApi } from "@/utils/bittrack-client";
import { useToast } from "@/components/ui/use-toast";

export function SecuritySettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [esploraBaseUrl, setEsploraBaseUrl] = useState("");

  useEffect(() => {
    if (!open) return;

    void (async () => {
      setLoading(true);
      try {
        const prefs = await getBittrackApi().getPreferences();
        setEsploraBaseUrl(prefs.esploraBaseUrl ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await getBittrackApi().setPreferences({
        esploraBaseUrl: esploraBaseUrl.trim() ? esploraBaseUrl.trim() : null,
      });
      if (!result.ok) {
        toast({
          title: "Could not save settings",
          description: result.error ?? "Check the API URL and try again.",
        });
        return;
      }
      toast({ title: "Blockchain API saved" });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Blockchain API</DialogTitle>
          <DialogDescription>
            Optional custom Esplora indexer for wallet sync on this device.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="esplora-url">Esplora API (optional)</Label>
            <Input
              id="esplora-url"
              disabled={loading || saving}
              value={esploraBaseUrl}
              onChange={(event) => setEsploraBaseUrl(event.target.value)}
              placeholder="https://your-esplora.example/api"
            />
            <p className="text-xs text-muted-foreground">
              Self-hosted Esplora base URL (HTTPS, or HTTP on localhost) for syncing for full privacy.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
