"use client";

import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { Flag, History, ImagePlus, Languages, MapPin, MessageCircle, Pencil, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type MentionUser = { _id: string; name: string; username: string; image?: string | null };
type CommentRecord = {
  _id: string;
  videoid: string;
  parentId: string | null;
  commentbody: string | null;
  author: { _id: string | null; name: string; username: string | null; image: string | null; location: string | null };
  mentions: MentionUser[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  revision: number;
  canEdit: boolean;
  likes: number;
  dislikes: number;
  viewerReaction: "like" | "dislike" | null;
};
type CommentResponse = { comments: CommentRecord[]; editWindowMinutes: number; sort: SortMode };
type ActiveAction = { kind: "reply" | "edit" | "delete"; id: string } | null;
type SortMode = "newest" | "oldest" | "liked" | "relevant";
type HistoryEntry = { revision: number; action: "created" | "edited" | "deleted" | "moderated" | "snapshot"; commentbody: string; changedAt: string };
type Challenge = { parentId: string | null; question: string };

const maxCommentLength = 2000;
const languageNames: Record<string, string> = { en: "English", hi: "Hindi", es: "Spanish" };

function commentLength(value: string) {
  return Array.from(value.trim()).length;
}

function errorMessage(error: unknown) {
  if (error instanceof AxiosError && typeof error.response?.data?.message === "string") return error.response.data.message;
  return "Something went wrong. Check that the local API is running and try again.";
}

function commentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return `${new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(date)} IST`;
}

function CommentBody({ body, mentions }: { body: string; mentions: MentionUser[] }) {
  const pieces = [];
  const pattern = /(?<![a-z0-9_])@([a-z0-9][a-z0-9-]{2,49})/gi;
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    pieces.push(body.slice(last, start));
    const target = mentions.find((user) => user.username === match[1].toLowerCase());
    pieces.push(target ? <span key={`${start}-${target._id}`} title={target.name} className="font-semibold text-[#dd604b] dark:text-[#ff9b87]">@{target.username}</span> : match[0]);
    last = start + match[0].length;
  }
  pieces.push(body.slice(last));
  return <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#445066] dark:text-[#e6ecf7]">{pieces}</p>;
}

function MentionEditor({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);

  useEffect(() => {
    if (query === null) return;
    let active = true;
    axiosInstance.get<{ users: MentionUser[] }>("/comment/mentions", { params: { q: query } })
      .then((response) => { if (active) setSuggestions(response.data.users); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, [query]);

  function updateQuery(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-z0-9-]{0,40})$/i);
    setQuery(match ? match[1].toLowerCase() : null);
    if (!match) setSuggestions([]);
  }

  function choose(user: MentionUser) {
    const cursor = textarea.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-z0-9-]{0,40})$/i);
    if (!match) return;
    const start = cursor - match[1].length - 1;
    const inserted = `@${user.username} `;
    onChange(`${value.slice(0, start)}${inserted}${value.slice(cursor)}`);
    setQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <textarea ref={textarea} id={id} value={value} onChange={(event) => { onChange(event.target.value); updateQuery(event.target.value, event.target.selectionStart); }} onClick={(event) => updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyUp={(event) => updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(null); setSuggestions([]); } }} rows={3} placeholder={placeholder} aria-autocomplete="list" className="w-full resize-y rounded-xl border border-[#dfe4eb] dark:border-[#3b465f] bg-[#fbfcfe] dark:bg-[#263149] px-4 py-3 text-sm text-[#253148] dark:text-[#e6ecf7] outline-none transition placeholder:text-[#a0a9b7] dark:placeholder:text-[#aab5c8] focus:border-[#ed6049] focus:bg-white dark:focus:bg-[#202a3d] focus:ring-2 focus:ring-[#ed6049]/15" />
      {query !== null && suggestions.length > 0 && <div role="listbox" aria-label="Mention suggestions" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#e4e8ef] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-1 shadow-[0_16px_38px_rgba(24,33,55,.15)]">{suggestions.map((user) => <button key={user._id} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(user)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[#fff1ed] dark:hover:bg-[#43313a]"><Avatar className="size-7 bg-[#f1edfb] dark:bg-[#35314b]">{user.image && <AvatarImage src={user.image} alt="" />}<AvatarFallback className="bg-[#f1edfb] dark:bg-[#35314b] text-xs text-[#7762aa] dark:text-[#c9baff]">{user.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate font-semibold text-[#344054] dark:text-[#e6ecf7]">{user.name}</span><span className="block truncate text-xs text-[#8994a5] dark:text-[#aab5c8]">@{user.username}</span></span></button>)}</div>}
    </div>
  );
}

export default function Comments({ videoId }: { videoId: string }) {
  const { user, login } = useUser();
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [sort, setSort] = useState<SortMode>("newest");
  const [editWindowMinutes, setEditWindowMinutes] = useState(15);
  const [rootText, setRootText] = useState("");
  const [actionText, setActionText] = useState("");
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLocation, setProfileLocation] = useState("");
  const [profileLanguage, setProfileLanguage] = useState("en");
  const [profileImage, setProfileImage] = useState<string | null | undefined>(undefined);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [translations, setTranslations] = useState<Record<string, { text: string; revision: number; language: string }>>({});
  const [translationError, setTranslationError] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let current = true;
    axiosInstance.get<CommentResponse>(`/comment/${videoId}`, { params: { sort } })
      .then((response) => {
        if (!current) return;
        setComments(response.data.comments);
        setEditWindowMinutes(response.data.editWindowMinutes);
        setError(null);
      })
      .catch((loadError) => { if (current) setError(errorMessage(loadError)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [videoId, sort, reloadKey]);

  function refresh() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function postComment(parentId: string | null) {
    const body = parentId ? actionText : rootText;
    if (!commentLength(body) || commentLength(body) > maxCommentLength) return;
    setBusy(true);
    setError(null);
    try {
      await axiosInstance.post(`/comment/${videoId}`, {
        commentbody: body, parentId,
        ...(challenge?.parentId === parentId && /^\d+$/.test(challengeAnswer) ? { captchaAnswer: Number(challengeAnswer) } : {}),
      });
      setChallenge(null);
      setChallengeAnswer("");
      if (parentId) { setActiveAction(null); setActionText(""); } else { setRootText(""); }
      refresh();
    } catch (postError) {
      if (postError instanceof AxiosError && postError.response?.status === 428 && typeof postError.response.data?.challenge?.question === "string") {
        setChallenge({ parentId, question: postError.response.data.challenge.question });
        setChallengeAnswer("");
      } else setError(errorMessage(postError));
    } finally {
      setBusy(false);
    }
  }

  async function editComment(comment: CommentRecord) {
    if (!commentLength(actionText) || commentLength(actionText) > maxCommentLength) return;
    setBusy(true);
    setError(null);
    try {
      await axiosInstance.patch(`/comment/${comment._id}`, { commentbody: actionText, expectedRevision: comment.revision });
      setActiveAction(null);
      setActionText("");
      refresh();
    } catch (editError) {
      setError(errorMessage(editError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(comment: CommentRecord) {
    setBusy(true);
    setError(null);
    try {
      await axiosInstance.delete(`/comment/${comment._id}`, { data: { expectedRevision: comment.revision } });
      setActiveAction(null);
      refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function react(comment: CommentRecord, kind: "like" | "dislike") {
    setBusy(true);
    setError(null);
    try {
      await axiosInstance.put(`/comment/${comment._id}/reaction`, { reaction: comment.viewerReaction === kind ? null : kind });
      refresh();
    } catch (reactionError) {
      setError(errorMessage(reactionError));
    } finally {
      setBusy(false);
    }
  }

  function openAction(kind: "reply" | "edit" | "delete", comment: CommentRecord) {
    setError(null);
    setActionText(kind === "edit" ? comment.commentbody || "" : "");
    setActiveAction({ kind, id: comment._id });
  }

  async function translate(comment: CommentRecord) {
    if (translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === (user?.preferredLanguage || "en")) {
      setTranslations((current) => { const next = { ...current }; delete next[comment._id]; return next; });
      return;
    }
    setTranslatingId(comment._id);
    setTranslationError((current) => ({ ...current, [comment._id]: "" }));
    try {
      const response = await axiosInstance.post<{ text: string; revision: number; language: string }>(`/comment/${comment._id}/translate`, { targetLanguage: user?.preferredLanguage || "en" });
      if (response.data.revision === comment.revision) setTranslations((current) => ({ ...current, [comment._id]: response.data }));
    } catch (translationFailure) {
      setTranslationError((current) => ({ ...current, [comment._id]: errorMessage(translationFailure) }));
    } finally {
      setTranslatingId(null);
    }
  }

  async function sendReport(comment: CommentRecord) {
    setBusy(true);
    setError(null);
    try {
      await axiosInstance.post(`/comment/${comment._id}/report`, { reason: reportReason });
      setReportedIds((current) => new Set(current).add(comment._id));
      setReportingId(null);
    } catch (reportFailure) {
      setError(errorMessage(reportFailure));
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(comment: CommentRecord) {
    if (historyId === comment._id) { setHistoryId(null); return; }
    setHistoryId(comment._id);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const response = await axiosInstance.get<{ history: HistoryEntry[] }>(`/comment/${comment._id}/history`);
      setHistoryEntries(response.data.history);
    } catch (historyError) {
      setError(errorMessage(historyError));
    } finally {
      setHistoryLoading(false);
    }
  }

  function openProfile() {
    setProfileLocation(user?.location || "");
    setProfileLanguage(user?.preferredLanguage || "en");
    setProfileImage(undefined);
    setProfileError(null);
    setProfileOpen(true);
  }

  async function choosePicture(file: File | undefined) {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 256 * 1024) {
      setProfileError("Choose a PNG, JPEG or WebP picture under 256 KB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid picture"));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setProfileImage(data);
      setProfileError(null);
    } catch {
      setProfileError("Could not read that picture. Try another file.");
    }
  }

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError(null);
    try {
      const changes = { location: profileLocation, preferredLanguage: profileLanguage, ...(profileImage !== undefined ? { image: profileImage } : {}) };
      const response = await axiosInstance.patch("/user/comment-profile", changes);
      login(response.data.user);
      setProfileOpen(false);
      refresh();
    } catch (profileSaveError) {
      setProfileError(errorMessage(profileSaveError));
    } finally {
      setProfileBusy(false);
    }
  }

  const commentIds = new Set(comments.map((comment) => comment._id));
  const children = new Map<string | null, CommentRecord[]>();
  for (const comment of comments) {
    const parent = comment.parentId && commentIds.has(comment.parentId) ? comment.parentId : null;
    children.set(parent, [...(children.get(parent) || []), comment]);
  }
  const activeCount = comments.filter((comment) => !comment.deletedAt).length;

  function renderComment(comment: CommentRecord, depth = 0) {
    const action = activeAction?.id === comment._id ? activeAction.kind : null;
    const replies = children.get(comment._id) || [];
    return (
      <div key={comment._id} className={depth ? "ml-5 border-l border-[#e7eaf0] dark:border-[#3b465f] pl-4 sm:ml-9 sm:pl-6" : ""}>
        <article className="flex gap-3 py-5">
          <Avatar className="size-10 shrink-0 bg-[#f1edfb] dark:bg-[#35314b]">
            {comment.author.image && <AvatarImage src={comment.author.image} alt="" />}
            <AvatarFallback className="bg-[#f1edfb] dark:bg-[#35314b] font-semibold text-[#7762aa] dark:text-[#c9baff]">{comment.author.name.charAt(0).toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-[#253148] dark:text-[#e6ecf7]">{comment.author.name}</span>
              {comment.author.username && <span className="text-xs text-[#8a94a5] dark:text-[#aab5c8]">@{comment.author.username}</span>}
              <time dateTime={comment.createdAt} className="text-xs text-[#8a94a5] dark:text-[#aab5c8]">{commentDate(comment.createdAt)}</time>
              {comment.editedAt && !comment.deletedAt && <span className="text-xs text-[#9aa3b2] dark:text-[#aab5c8]">· Edited</span>}
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#9aa3b2] dark:text-[#aab5c8]"><MapPin className="size-3" aria-hidden="true" /> {comment.author.location || "Location not shared"}</p>
            {comment.deletedAt ? <p className="mt-2 rounded-lg bg-[#f5f6f8] dark:bg-[#263149] px-3 py-2 text-sm italic text-[#8c96a5] dark:text-[#aab5c8]">Comment deleted</p> : <CommentBody body={comment.commentbody || ""} mentions={comment.mentions} />}
            {!comment.deletedAt && translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === (user?.preferredLanguage || "en") && <div className="mt-3 rounded-xl border border-[#dce8df] dark:border-[#49685a] bg-[#f3faf5] dark:bg-[#273d3a] px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#548567] dark:text-[#91d7ae]">{languageNames[translations[comment._id].language]} translation · local model</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#344d3b] dark:text-[#91d7ae]">{translations[comment._id].text}</p></div>}
            {translationError[comment._id] && <p role="alert" className="mt-2 text-xs text-[#a65348] dark:text-[#ff9b87]">{translationError[comment._id]}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold">
              {!comment.deletedAt && <><button type="button" aria-label={`Like comment by ${comment.author.name}`} aria-pressed={comment.viewerReaction === "like"} disabled={busy} onClick={() => void react(comment, "like")} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${comment.viewerReaction === "like" ? "bg-[#fff0ec] dark:bg-[#43313a] text-[#d65d46] dark:text-[#ff9b87]" : "text-[#687486] dark:text-[#aab5c8] hover:bg-[#f3f5f8] dark:hover:bg-[#263149]"}`}><ThumbsUp className="size-3.5" aria-hidden="true" /> {comment.likes}</button><button type="button" aria-label={`Dislike comment by ${comment.author.name}`} aria-pressed={comment.viewerReaction === "dislike"} disabled={busy} onClick={() => void react(comment, "dislike")} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${comment.viewerReaction === "dislike" ? "bg-[#f1edfb] dark:bg-[#35314b] text-[#7762aa] dark:text-[#c9baff]" : "text-[#687486] dark:text-[#aab5c8] hover:bg-[#f3f5f8] dark:hover:bg-[#263149]"}`}><ThumbsDown className="size-3.5" aria-hidden="true" /> {comment.dislikes}</button></>}
              {user && <button type="button" onClick={() => openAction("reply", comment)} className="text-[#dd604b] dark:text-[#ff9b87] hover:underline">Reply</button>}
              {comment.canEdit && <button type="button" onClick={() => openAction("edit", comment)} className="inline-flex items-center gap-1 text-[#687486] dark:text-[#aab5c8] hover:text-[#344054] dark:hover:text-[#e6ecf7]"><Pencil className="size-3" aria-hidden="true" /> Edit</button>}
              {comment.canEdit && <button type="button" onClick={() => openAction("delete", comment)} className="inline-flex items-center gap-1 text-[#687486] dark:text-[#aab5c8] hover:text-[#b94f43] dark:hover:text-[#ff9b87]"><Trash2 className="size-3" aria-hidden="true" /> Delete</button>}
              {comment.author._id === user?._id && comment.revision > 1 && <button type="button" onClick={() => void toggleHistory(comment)} className="inline-flex items-center gap-1 text-[#687486] dark:text-[#aab5c8] hover:text-[#344054] dark:hover:text-[#e6ecf7]"><History className="size-3" aria-hidden="true" /> History</button>}
              {!comment.deletedAt && <button type="button" disabled={translatingId === comment._id} onClick={() => void translate(comment)} className="inline-flex items-center gap-1 text-[#687486] dark:text-[#aab5c8] hover:text-[#344054] dark:hover:text-[#e6ecf7] disabled:opacity-50"><Languages className="size-3.5" aria-hidden="true" /> {translatingId === comment._id ? "Translating…" : translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === (user?.preferredLanguage || "en") ? "Hide translation" : `Translate to ${languageNames[user?.preferredLanguage || "en"]}`}</button>}
              {!comment.deletedAt && comment.author._id !== user?._id && (reportedIds.has(comment._id) ? <span className="text-[#548567] dark:text-[#91d7ae]">Reported for review</span> : <button type="button" onClick={() => { setReportingId(comment._id); setReportReason("spam"); }} className="inline-flex items-center gap-1 text-[#687486] dark:text-[#aab5c8] hover:text-[#a65348] dark:hover:text-[#ff9b87]"><Flag className="size-3.5" aria-hidden="true" /> Report</button>)}
            </div>
            {reportingId === comment._id && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[#e7e9ee] dark:border-[#3b465f] bg-[#f9fafc] dark:bg-[#263149] p-3"><div><label htmlFor={`report-reason-${comment._id}`} className="block text-xs font-semibold text-[#586579] dark:text-[#e6ecf7]">Why report this comment?</label><select id={`report-reason-${comment._id}`} value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-1 rounded-lg border border-[#dfe4eb] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-3 py-2 text-xs text-[#344054] dark:text-[#e6ecf7]"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="offensive">Offensive content</option></select></div><button type="button" onClick={() => void sendReport(comment)} disabled={busy} className="rounded-lg bg-[#ed6049] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send report</button><button type="button" onClick={() => setReportingId(null)} className="px-2 py-2 text-xs font-semibold text-[#687486] dark:text-[#aab5c8]">Cancel</button></div>}
            {(action === "reply" || action === "edit") && <div className="mt-4 space-y-2"><MentionEditor id={`comment-action-${comment._id}`} value={actionText} onChange={setActionText} placeholder={action === "reply" ? `Reply to ${comment.author.name}…` : "Edit your comment…"} /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#929bab] dark:text-[#aab5c8]">{commentLength(actionText)} / {maxCommentLength} · Type @ to mention</span><div className="flex gap-2"><button type="button" onClick={() => setActiveAction(null)} disabled={busy} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#687486] dark:text-[#aab5c8] hover:bg-[#f3f5f8] dark:hover:bg-[#263149]">Cancel</button><button type="button" onClick={() => action === "reply" ? void postComment(comment._id) : void editComment(comment)} disabled={busy || !commentLength(actionText) || commentLength(actionText) > maxCommentLength} className="rounded-lg bg-[#ed6049] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#d9543e] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : action === "reply" ? "Post reply" : "Save changes"}</button></div></div></div>}
            {action === "reply" && challenge?.parentId === comment._id && <div className="mt-2 rounded-xl border border-[#eddac9] dark:border-[#73505a] bg-[#fff9f3] dark:bg-[#43313a] p-3"><label htmlFor={`reply-check-${comment._id}`} className="block text-xs font-semibold text-[#805b3c] dark:text-[#eac48e]">Local posting check: {challenge.question}</label><input id={`reply-check-${comment._id}`} inputMode="numeric" value={challengeAnswer} onChange={(event) => setChallengeAnswer(event.target.value)} className="mt-2 w-24 rounded-lg border border-[#e1c9ae] dark:border-[#73505a] bg-white dark:bg-[#202a3d] px-3 py-2 text-sm" /><p className="mt-1 text-xs text-[#9b7758] dark:text-[#eac48e]">Enter the answer, then press Post reply again.</p></div>}
            {action === "delete" && <div className="mt-4 rounded-xl border border-[#f1d5d0] dark:border-[#73505a] bg-[#fff7f5] dark:bg-[#43313a] p-3 text-sm text-[#82453c] dark:text-[#ff9b87]"><p>Delete this comment? Replies will remain visible.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setActiveAction(null)} disabled={busy} className="rounded-lg border border-[#e1c3bd] dark:border-[#73505a] px-3 py-1.5 text-xs font-semibold">Cancel</button><button type="button" onClick={() => void deleteComment(comment)} disabled={busy} className="rounded-lg bg-[#b94f43] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? "Deleting…" : "Delete comment"}</button></div></div>}
            {historyId === comment._id && <div className="mt-4 rounded-xl border border-[#e4e8ef] dark:border-[#3b465f] bg-[#f8f9fb] dark:bg-[#263149] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#687486] dark:text-[#aab5c8]">Your comment history</p>{historyLoading ? <p className="mt-2 text-xs text-[#929bab] dark:text-[#aab5c8]">Loading history…</p> : <ol className="mt-3 space-y-3">{historyEntries.map((entry) => <li key={entry.revision} className="border-l-2 border-[#dfc2ba] dark:border-[#73505a] pl-3 text-xs text-[#586579] dark:text-[#e6ecf7]"><span className="font-semibold capitalize text-[#344054] dark:text-[#e6ecf7]">{entry.action}</span> · {commentDate(entry.changedAt)}{!["deleted", "moderated"].includes(entry.action) && <p className="mt-1 whitespace-pre-wrap break-words">{entry.commentbody}</p>}</li>)}</ol>}</div>}
          </div>
        </article>
        {replies.map((reply) => renderComment(reply, Math.min(depth + 1, 3)))}
      </div>
    );
  }

  return (
    <section className="rounded-[22px] border border-[#e8ebf0] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] p-6 sm:p-7" aria-labelledby="comments-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e16b55] dark:text-[#ff9b87]">Conversation</p><h2 id="comments-heading" className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-[-0.04em] text-[#253148] dark:text-[#e6ecf7]"><MessageCircle className="size-5 text-[#ed6049] dark:text-[#ff9b87]" aria-hidden="true" /> {activeCount} {activeCount === 1 ? "comment" : "comments"}</h2></div><div className="flex flex-wrap items-center gap-2"><label htmlFor="comment-sort" className="text-xs font-medium text-[#7a8596] dark:text-[#aab5c8]">Sort by</label><select id="comment-sort" value={sort} onChange={(event) => { setLoading(true); setSort(event.target.value as SortMode); }} className="rounded-lg border border-[#e2e6ec] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-3 py-2 text-xs font-semibold text-[#445066] dark:text-[#e6ecf7] outline-none focus:border-[#ed6049]"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="liked">Most liked</option><option value="relevant">Most relevant</option></select></div></div>
      <p className="mt-2 text-xs text-[#929bab] dark:text-[#aab5c8]">Edit or delete your own comments within {editWindowMinutes} minutes.</p>

      {user && <div className="mt-6 border-b border-[#edf0f4] dark:border-[#3b465f] pb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#7e8999] dark:text-[#aab5c8]">Posting as <span className="font-semibold text-[#445066] dark:text-[#e6ecf7]">@{user.username || "member"}</span></span><button type="button" onClick={openProfile} className="text-xs font-semibold text-[#dd604b] dark:text-[#ff9b87] hover:underline">Edit comment profile</button></div>
        {profileOpen && <div className="mb-5 rounded-2xl border border-[#e6e9ef] dark:border-[#3b465f] bg-[#f9fafc] dark:bg-[#263149] p-4">
          <p className="text-sm font-semibold text-[#344054] dark:text-[#e6ecf7]">Your comment profile</p>
          <p className="mt-1 text-xs text-[#8a94a5] dark:text-[#aab5c8]">Location is self-reported. Your picture is stored only in local MongoDB.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3"><Avatar className="size-12 bg-[#fff0ec] dark:bg-[#43313a]">{(profileImage === undefined ? user.image : profileImage) && <AvatarImage src={profileImage === undefined ? user.image : profileImage || ""} alt="" />}<AvatarFallback className="bg-[#fff0ec] dark:bg-[#43313a] font-semibold text-[#d76750] dark:text-[#ff9b87]">{user.name?.charAt(0).toUpperCase() || "Y"}</AvatarFallback></Avatar><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#dfe4eb] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-3 py-2 text-xs font-semibold text-[#586579] dark:text-[#e6ecf7] hover:border-[#ed6049]"><ImagePlus className="size-4" aria-hidden="true" /> Choose picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void choosePicture(event.target.files?.[0])} className="sr-only" /></label><button type="button" onClick={() => setProfileImage(null)} className="text-xs font-semibold text-[#a65348] dark:text-[#ff9b87] hover:underline">Remove picture</button></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor="comment-profile-location" className="block text-xs font-semibold text-[#586579] dark:text-[#e6ecf7]">Location</label><input id="comment-profile-location" value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} maxLength={80} placeholder="e.g. Pune, India" className="mt-1 w-full rounded-lg border border-[#dfe4eb] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-3 py-2 text-sm text-[#344054] dark:text-[#e6ecf7] outline-none focus:border-[#ed6049]" /></div><div><label htmlFor="comment-language" className="block text-xs font-semibold text-[#586579] dark:text-[#e6ecf7]">Translate comments to</label><select id="comment-language" value={profileLanguage} onChange={(event) => setProfileLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-[#dfe4eb] dark:border-[#3b465f] bg-white dark:bg-[#202a3d] px-3 py-2 text-sm text-[#344054] dark:text-[#e6ecf7] outline-none focus:border-[#ed6049]"><option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option></select></div></div>
          {profileError && <p role="alert" className="mt-2 text-xs text-[#a65348] dark:text-[#ff9b87]">{profileError}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setProfileOpen(false)} disabled={profileBusy} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#687486] dark:text-[#aab5c8] hover:bg-white dark:hover:bg-[#202a3d]">Cancel</button><button type="button" onClick={() => void saveProfile()} disabled={profileBusy} className="rounded-lg bg-[#ed6049] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{profileBusy ? "Saving…" : "Save profile"}</button></div>
        </div>}
        <div className="flex gap-3"><Avatar className="size-10 shrink-0 bg-[#fff0ec] dark:bg-[#43313a]">{user.image && <AvatarImage src={user.image} alt="" />}<AvatarFallback className="bg-[#fff0ec] dark:bg-[#43313a] font-semibold text-[#d76750] dark:text-[#ff9b87]">{user.name?.charAt(0).toUpperCase() || "Y"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><MentionEditor id="new-comment" value={rootText} onChange={setRootText} placeholder="Share your thoughts…" />
          {challenge?.parentId === null && <div className="mt-2 rounded-xl border border-[#eddac9] dark:border-[#73505a] bg-[#fff9f3] dark:bg-[#43313a] p-3"><label htmlFor="root-post-check" className="block text-xs font-semibold text-[#805b3c] dark:text-[#eac48e]">Local posting check: {challenge.question}</label><input id="root-post-check" inputMode="numeric" value={challengeAnswer} onChange={(event) => setChallengeAnswer(event.target.value)} className="mt-2 w-24 rounded-lg border border-[#e1c9ae] dark:border-[#73505a] bg-white dark:bg-[#202a3d] px-3 py-2 text-sm" /><p className="mt-1 text-xs text-[#9b7758] dark:text-[#eac48e]">Enter the answer, then press Post comment again.</p></div>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[#929bab] dark:text-[#aab5c8]">{commentLength(rootText)} / {maxCommentLength} · Type @ to mention</span><button type="button" onClick={() => void postComment(null)} disabled={busy || !commentLength(rootText) || commentLength(rootText) > maxCommentLength} className="inline-flex items-center gap-2 rounded-xl bg-[#ed6049] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#d9543e] disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-3.5" aria-hidden="true" /> {busy ? "Posting…" : "Post comment"}</button></div>
        </div></div>
      </div>}

      {error && <div role="alert" className="mt-4 rounded-xl border border-[#f2d4cd] dark:border-[#73505a] bg-[#fff7f4] dark:bg-[#43313a] px-4 py-3 text-sm text-[#a04e40] dark:text-[#ff9b87]">{error} <button type="button" onClick={refresh} className="ml-1 font-semibold underline">Refresh</button></div>}
      {loading && <p className="py-8 text-center text-sm text-[#929bab] dark:text-[#aab5c8]">Loading comments…</p>}
      {!loading && !comments.length && !error && <div className="py-10 text-center"><MessageCircle className="mx-auto size-7 text-[#c7cdd8]" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-[#6e7a8d] dark:text-[#aab5c8]">No comments yet. Start the conversation.</p></div>}
      {!loading && comments.length > 0 && <div className="divide-y divide-[#edf0f4] dark:divide-[#3b465f]">{(children.get(null) || []).map((comment) => renderComment(comment))}</div>}
    </section>
  );
}
