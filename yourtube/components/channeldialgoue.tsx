"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";

type ChannelData = { name?: string; description?: string };
type Props = {
  isopen: boolean;
  onclose: () => void;
  channeldata?: ChannelData;
  mode: "create" | "edit";
};

function ChannelForm({ onclose, channeldata, mode }: Omit<Props, "isopen">) {
  const { user, login } = useUser();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: mode === "edit" ? channeldata?.name || "" : user?.name || "",
    description: mode === "edit" ? channeldata?.description || "" : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await axiosInstance.patch(`/user/update/${user._id}`, {
        channelname: formData.name,
        description: formData.description,
      });
      login(response.data.user);
      onclose();
      router.push(`/channel/${user._id}`);
    } catch {
      setError("Could not save your channel. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "create" ? "Create your channel" : "Edit your channel"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="channel-name">Channel name</Label>
          <Input id="channel-name" name="name" value={formData.name} onChange={handleChange} maxLength={80} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="channel-description">Description</Label>
          <Textarea id="channel-description" name="description" value={formData.description} onChange={handleChange} maxLength={1000} rows={4} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onclose}>Cancel</Button>
          <Button type="submit" disabled={submitting || !user}>{submitting ? "Saving..." : "Save channel"}</Button>
        </DialogFooter>
      </form>
    </>
  );
}

export default function ChannelDialogue({ isopen, onclose, channeldata, mode }: Props) {
  return (
    <Dialog open={isopen} onOpenChange={(open) => { if (!open) onclose(); }}>
      <DialogContent>
        {isopen && <ChannelForm onclose={onclose} channeldata={channeldata} mode={mode} />}
      </DialogContent>
    </Dialog>
  );
}
