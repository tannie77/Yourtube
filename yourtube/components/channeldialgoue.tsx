"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useState, ChangeEvent, FormEvent } from "react";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";

const ChannelDialogue = ({ isopen, onclose, channeldata, mode }: any) => {
    const {user, login } = useUser();
// const user: any = {
//     id: "1",
//     name: "John Doe",
//     email: "john@example.com",
//     image: "https://github.com/shadcn.png?height=32&width=32",
// };
const router = useRouter();
const [formData, setFormData] = useState({
    name: "",
    description: "",
});
const [isSubmitting, setIsSubmitting] = useState(false);

useEffect(() => {
    if (channeldata && mode === "edit") {
    setFormData({
        name: channeldata.name || "",
        description: channeldata.description || "",
    });
    } else {
    setFormData({
        name: user?.name || "",
        description: "",
    });
    }
}, [channeldata, mode]);

const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
};

const handlesubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
            channelname: formData.name,
            description: formData.description,
            };
            const response = await axiosInstance.patch(`/user/update/${user._id}`, payload);
            login(response?.data)
            router.push(`/channel/${user._id}`);
            setFormData({
        name: "",
        description: "",
    });
            onclose(); 
};

return (
    <Dialog open={isopen} onOpenChange={onclose}>
    <DialogContent>
        <DialogHeader>
        <DialogTitle>
            {mode === "create" ? "Create your channel" : "Edit your channel"}
        </DialogTitle>
        </DialogHeader>
        <form onSubmit={handlesubmit}>
        <div className="space-y-2 mb-4">
            <Label htmlFor="name">Channel Name</Label>
            <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
            />
        </div>
        <div className="space-y-2 mb-4">
            <Label htmlFor="description">Channel Description</Label>
            <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
            />
        </div>

        <DialogFooter>
            <Button type="button" variant="outline" onClick={onclose}>
            Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
                ? "Saving..."
                : mode === "create"
                ? "Create channel"
                : "Save Changes"}
            </Button>
        </DialogFooter>
        </form>
    </DialogContent>
    </Dialog>
);
};

export default ChannelDialogue;
