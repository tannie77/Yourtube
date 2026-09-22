"use client";
import React, { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";

    interface Comment {
    _id: string;
    videoid: string;
    userid: string;
    commentbody: string;
    usercommented: string;
    commentedon: string;
    }

    const Comments = ({ videoId }: any) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");

    const user: any = {
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        image: "https://github.com/shadcn.png?height=32&width=32",
    };

    const fetchedComments: Comment[] = [
        {
        _id: "1",
        videoid: videoId,
        userid: "1",
        commentbody: "Great video! Really enjoyed watching this.",
        usercommented: "John Doe",
        commentedon: "2024-01-15T09:00:00.000Z",
        },
        {
        _id: "2",
        videoid: videoId,
        userid: "2",
        commentbody: "Thanks for sharing this amazing content!",
        usercommented: "Jane Smith",
        commentedon: "2024-01-15T08:00:00.000Z",
        },
    ];

    useEffect(() => {
        loadComments();
    }, [videoId]);

    const loadComments = async () => {
        setComments(fetchedComments);
    };

    const handleSubmitComment = async () => {
        if (!user || !newComment.trim()) return;
        setIsSubmitting(true);
        try {
        const newCommentObj: Comment = {
            _id: Date.now().toString(),
            videoid: videoId,
            userid: user.id,
            commentbody: newComment,
            usercommented: user.name || "Anonymous",
            commentedon: new Date().toISOString(),
        };
        setComments([newCommentObj, ...comments]);
        setNewComment("");
        } catch (error) {
        console.error("Error adding comment:", error);
        } finally {
        setIsSubmitting(false);
        }
    };

    const handleEdit = (comment: Comment) => {
        setEditingCommentId(comment._id);
        setEditText(comment.commentbody);
    };

    const handleUpdateComment = () => {
        if (!editText.trim()) return;
        setComments((prev) =>
        prev.map((c) =>
            c._id === editingCommentId ? { ...c, commentbody: editText } : c
        )
        );
        setEditingCommentId(null);
        setEditText("");
    };

    const handleDelete = (id: string) => {
        setComments((prev) => prev.filter((c) => c._id !== id));
    };

    return (
        <div>
        <h2>{comments.length} Comments</h2>
        {user && (
            <div>
            <Avatar>
                <AvatarImage src={user.image} alt={user.name} />
                <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
            <div>
                <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                />
                <div>
                <Button
                    onClick={() => setNewComment("")}
                    disabled={!newComment.trim()}
                >
                    Cancel
                </Button>
                <Button onClick={handleSubmitComment}>
                    Comment
                </Button>
                </div>
            </div>
            </div>
        )}

        <div>
            {comments.map((comment) => (
            <div key={comment._id}>
                <Avatar>
                <AvatarFallback>{comment.usercommented[0]}</AvatarFallback>
                </Avatar>
                <div>
                <div>
                    <span>{comment.usercommented}</span>
                    <span>{formatDistanceToNow(new Date(comment.commentedon))} ago</span>
                </div>
                {editingCommentId === comment._id ? (
                    <div>
                    <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                    />
                    <div>
                        <Button onClick={handleUpdateComment}>Save</Button>
                        <Button
                        onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                        }}
                        >
                        Cancel
                        </Button>
                    </div>
                    </div>
                ) : (
                        <>
                        <p>{comment.commentbody}</p>
                    {comment.userid === user.id && (
                    <div>
                        <Button onClick={() => handleEdit(comment)}>Edit</Button>
                        <Button onClick={() => handleDelete(comment._id)}>
                        Delete
                        </Button>
                    </div>
                    )}
                </>
                )}
            </div>
            </div>
            ))}
        </div>
        </div>
    );
    };

export default Comments;