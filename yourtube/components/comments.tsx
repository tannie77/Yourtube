"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type Comment = { _id: string; userid: string; commentbody: string; usercommented: string; commentedon: string };

export default function Comments({ videoId }: { videoId: string }) {
  const { user } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadComments = async () => {
    try {
      const response = await axiosInstance.get(`/comment/${videoId}`);
      setComments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Could not load comments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadComments(); }, [videoId]);

  const submitComment = async () => {
    const userId = user?._id || user?.id;
    if (!userId || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await axiosInstance.post("/comment/postcomment", { videoid: videoId, userid: userId, commentbody: newComment.trim(), usercommented: user.name || "You" });
      setNewComment("");
      await loadComments();
    } catch (error) {
      console.error("Could not add comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 pt-2">
      <h2 className="text-xl font-bold">{comments.length} Comments</h2>
      {user ? (
        <div className="flex gap-3">
          <Avatar className="size-10"><AvatarImage src={user.image || ""} /><AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback></Avatar>
          <div className="flex-1 space-y-2">
            <Textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add a comment..." className="min-h-12 resize-none rounded-none border-x-0 border-t-0 px-0 focus-visible:ring-0" />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setNewComment("")} disabled={!newComment}>Cancel</Button><Button className="rounded-full" onClick={submitComment} disabled={!newComment.trim() || submitting}>{submitting ? "Posting..." : "Comment"}</Button></div>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">Sign in to add a comment.</p>}
      {loading ? <p className="text-sm text-muted-foreground">Loading comments...</p> : comments.map((comment) => (
        <article key={comment._id} className="flex gap-3">
          <Avatar className="size-10"><AvatarFallback>{comment.usercommented?.[0]?.toUpperCase() || "U"}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-semibold">@{comment.usercommented || "User"}</span><span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comment.commentedon), { addSuffix: true })}</span><Button variant="ghost" size="icon" className="ml-auto size-8"><MoreVertical className="size-4" /></Button></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{comment.commentbody}</p></div>
        </article>
      ))}
    </section>
  );
}
