import { useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { formatDistanceToNow } from "date-fns";
import { Clock3, Flag, History, ImagePlus, Languages, MapPin, MessageCircle, Pencil, Send, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

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
  viewerReported: boolean;
};
type SortMode = "newest" | "oldest" | "liked" | "relevant";
type CommentResponse = { comments: CommentRecord[]; sort: SortMode; editWindowMinutes: number };
type Action = { kind: "reply" | "edit" | "delete"; id: string } | null;
type Challenge = ({ parentId: string | null; provider: "local"; question: string } | { parentId: string | null; provider: "turnstile"; siteKey: string }) | null;
type HistoryEntry = { revision: number; action: string; commentbody: string; changedAt: string };
type Translation = { text: string; revision: number; language: string };

const maxCommentLength = 2000;
const languageNames: Record<string, string> = { en: "English", hi: "Hindi", es: "Spanish", fr: "French", ur: "Urdu" };

function commentLength(value: string) { return Array.from(value.trim()).length; }

function errorMessage(error: unknown) {
  if (error instanceof AxiosError && typeof error.response?.data?.message === "string") return error.response.data.message;
  return "Comments are unavailable. Please try again.";
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date)} IST`;
}

function CommentAvatar({ name, image }: { name: string; image?: string | null }) {
  return <span className="yt-comment-avatar" aria-hidden="true">{image?.startsWith("data:image/") ? <img src={image} alt="" /> : name.charAt(0).toUpperCase() || "U"}</span>;
}

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
type TurnstileWindow = Window & { turnstile?: TurnstileApi };
function TurnstileChallenge({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  useEffect(() => {
    let current = true;
    let widgetId: string | null = null;
    const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    let script = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    function render() {
      const api = (window as TurnstileWindow).turnstile;
      if (!current || !container.current || !api || widgetId !== null) return;
      widgetId = api.render(container.current, {
        sitekey: siteKey,
        callback: (token: string) => callback.current(token),
        "expired-callback": () => callback.current(""),
        "error-callback": () => callback.current(""),
      });
    }
    if (!script) {
      script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    script.addEventListener("error", () => setLoadError(true), { once: true });
    render();
    const retry = window.setTimeout(render, 500);
    return () => {
      current = false;
      window.clearTimeout(retry);
      script?.removeEventListener("load", render);
      if (widgetId !== null) (window as TurnstileWindow).turnstile?.remove(widgetId);
    };
  }, [siteKey]);
  return <div className="yt-comment-challenge"><p>Complete the posting verification, then post again.</p><div ref={container} />{loadError && <p role="alert">Verification could not load. Check your connection and try again.</p>}</div>;
}

function CommentBody({ body, mentions }: { body: string; mentions: MentionUser[] }) {
  const pieces = [];
  let last = 0;
  for (const match of body.matchAll(/(?<![a-z0-9_])@([a-z0-9][a-z0-9-]{2,49})/gi)) {
    const start = match.index ?? 0;
    pieces.push(body.slice(last, start));
    const target = mentions.find((user) => user.username === match[1].toLowerCase());
    pieces.push(target ? <span key={`${start}-${target._id}`} className="yt-comment-mention" title={target.name}>@{target.username}</span> : match[0]);
    last = start + match[0].length;
  }
  pieces.push(body.slice(last));
  return <p className="yt-comment-body">{pieces}</p>;
}

function MentionEditor({ id, value, onChange, placeholder, rows = 2 }: { id: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  useEffect(() => {
    if (query === null) return;
    let current = true;
    axiosInstance.get<{ users: MentionUser[] }>("/comment/mentions", { params: { q: query } })
      .then((response) => { if (current) setSuggestions(response.data.users); })
      .catch(() => { if (current) setSuggestions([]); });
    return () => { current = false; };
  }, [query]);
  function updateQuery(text: string, cursor: number) {
    const match = text.slice(0, cursor).match(/(?:^|\s)@([a-z0-9-]{0,40})$/i);
    setQuery(match ? match[1].toLowerCase() : null);
    if (!match) setSuggestions([]);
  }
  function choose(user: MentionUser) {
    const cursor = textarea.current?.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/(?:^|\s)@([a-z0-9-]{0,40})$/i);
    if (!match) return;
    const start = cursor - match[1].length - 1;
    const inserted = `@${user.username} `;
    onChange(`${value.slice(0, start)}${inserted}${value.slice(cursor)}`);
    setQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + inserted.length, start + inserted.length); });
  }
  return <div className="yt-mention-editor"><label htmlFor={id} className="sr-only">{placeholder}</label><textarea ref={textarea} id={id} className="yt-comment-textarea" rows={rows} value={value} onChange={(event) => { onChange(event.target.value); updateQuery(event.target.value, event.target.selectionStart); }} onClick={(event) => updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyUp={(event) => updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(null); setSuggestions([]); } }} placeholder={placeholder} aria-autocomplete="list" />{query !== null && suggestions.length > 0 && <div role="listbox" aria-label="Mention suggestions" className="yt-mention-suggestions">{suggestions.map((user) => <button key={user._id} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(user)}><CommentAvatar name={user.name} image={user.image} /><span><strong>{user.name}</strong><small>@{user.username}</small></span></button>)}</div>}</div>;
}

export default function Comments({ videoId }: { videoId: string }) {
  const { user, login } = useUser();
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [sort, setSort] = useState<SortMode>("newest");
  const [editWindowMinutes, setEditWindowMinutes] = useState(15);
  const [rootText, setRootText] = useState("");
  const [actionText, setActionText] = useState("");
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [challenge, setChallenge] = useState<Challenge>(null);
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLocation, setProfileLocation] = useState("");
  const [profileLanguage, setProfileLanguage] = useState("en");
  const [profileImage, setProfileImage] = useState<string | null | undefined>(undefined);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translationError, setTranslationError] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let current = true;
    setLoading(true);
    axiosInstance.get<CommentResponse>(`/comment/${videoId}`, { params: { sort } })
      .then((response) => {
        if (!current) return;
        setComments(response.data.comments);
        setEditWindowMinutes(response.data.editWindowMinutes);
        setError("");
      })
      .catch((failure) => { if (current) setError(errorMessage(failure)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [videoId, sort, reloadKey]);

  function refresh() { setReloadKey((value) => value + 1); }

  async function postComment(parentId: string | null) {
    const body = parentId ? actionText : rootText;
    if (!commentLength(body) || commentLength(body) > maxCommentLength || busy) return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.post(`/comment/${videoId}`, {
        commentbody: body, parentId,
        ...(challenge?.parentId === parentId && /^\d+$/.test(challengeAnswer) ? { captchaAnswer: Number(challengeAnswer) } : {}),
        ...(challenge?.parentId === parentId && captchaToken ? { captchaToken } : {}),
      });
      setChallenge(null);
      setChallengeAnswer("");
      setCaptchaToken("");
      if (parentId) { setActiveAction(null); setActionText(""); } else setRootText("");
      refresh();
    } catch (failure) {
      if (failure instanceof AxiosError && failure.response?.status === 428 && failure.response.data?.challenge?.provider === "turnstile" && typeof failure.response.data.challenge.siteKey === "string") {
        setChallenge({ parentId, provider: "turnstile", siteKey: failure.response.data.challenge.siteKey });
        setCaptchaToken("");
        setChallengeKey((value) => value + 1);
      } else if (failure instanceof AxiosError && failure.response?.status === 428 && typeof failure.response.data?.challenge?.question === "string") {
        setChallenge({ parentId, provider: "local", question: failure.response.data.challenge.question });
        setChallengeAnswer("");
      } else setError(errorMessage(failure));
    } finally { setBusy(false); }
  }

  async function editComment(comment: CommentRecord) {
    if (!commentLength(actionText) || commentLength(actionText) > maxCommentLength || busy) return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.patch(`/comment/${comment._id}`, { commentbody: actionText, expectedRevision: comment.revision });
      setActiveAction(null);
      setActionText("");
      refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function deleteComment(comment: CommentRecord) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.delete(`/comment/${comment._id}`, { data: { expectedRevision: comment.revision } });
      setActiveAction(null);
      refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function react(comment: CommentRecord, kind: "like" | "dislike") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.put(`/comment/${comment._id}/reaction`, { reaction: comment.viewerReaction === kind ? null : kind });
      refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function translate(comment: CommentRecord) {
    const language = user?.preferredLanguage || "en";
    if (translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === language) {
      setTranslations((current) => { const next = { ...current }; delete next[comment._id]; return next; });
      return;
    }
    setTranslatingId(comment._id);
    setTranslationError((current) => ({ ...current, [comment._id]: "" }));
    try {
      const response = await axiosInstance.post<Translation>(`/comment/${comment._id}/translate`, { targetLanguage: language });
      if (response.data.revision === comment.revision) setTranslations((current) => ({ ...current, [comment._id]: response.data }));
    } catch (failure) { setTranslationError((current) => ({ ...current, [comment._id]: errorMessage(failure) })); }
    finally { setTranslatingId(null); }
  }

  async function sendReport(comment: CommentRecord) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await axiosInstance.post(`/comment/${comment._id}/report`, { reason: reportReason });
      setReportedIds((current) => new Set(current).add(comment._id));
      setReportingId(null);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  function openProfile() {
    setProfileLocation(user?.location || "");
    setProfileLanguage(user?.preferredLanguage || "en");
    setProfileImage(undefined);
    setProfileError("");
    setProfileOpen(true);
  }

  async function choosePicture(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 256 * 1024) {
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
      setProfileError("");
    } catch { setProfileError("Could not read that picture. Try another file."); }
  }

  async function saveProfile() {
    setProfileBusy(true);
    setProfileError("");
    try {
      const changes = { location: profileLocation, preferredLanguage: profileLanguage, ...(profileImage !== undefined ? { image: profileImage } : {}) };
      const response = await axiosInstance.patch("/user/comment-profile", changes);
      login(response.data.user);
      setProfileOpen(false);
      refresh();
    } catch (failure) { setProfileError(errorMessage(failure)); }
    finally { setProfileBusy(false); }
  }

  async function toggleHistory(comment: CommentRecord) {
    if (historyId === comment._id) { setHistoryId(null); return; }
    setHistoryId(comment._id);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const response = await axiosInstance.get<{ history: HistoryEntry[] }>(`/comment/${comment._id}/history`);
      setHistoryEntries(response.data.history);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setHistoryLoading(false); }
  }

  function openAction(kind: "reply" | "edit" | "delete", comment: CommentRecord) {
    setError("");
    setChallenge(null);
    setChallengeAnswer("");
    setCaptchaToken("");
    setActionText(kind === "edit" ? comment.commentbody || "" : "");
    setActiveAction({ kind, id: comment._id });
  }

  function challengeField(parentId: string | null) {
    if (challenge?.parentId !== parentId) return null;
    if (challenge.provider === "turnstile") return <TurnstileChallenge key={challengeKey} siteKey={challenge.siteKey} onToken={setCaptchaToken} />;
    return <div className="yt-comment-challenge"><label htmlFor={`comment-check-${parentId || "root"}`}>Local posting check: {challenge.question}</label><input id={`comment-check-${parentId || "root"}`} inputMode="numeric" value={challengeAnswer} onChange={(event) => setChallengeAnswer(event.target.value)} /><p>Enter the answer and post again.</p></div>;
  }

  const knownIds = new Set(comments.map((comment) => comment._id));
  const children = new Map<string | null, CommentRecord[]>();
  for (const comment of comments) {
    const parent = comment.parentId && knownIds.has(comment.parentId) ? comment.parentId : null;
    children.set(parent, [...(children.get(parent) || []), comment]);
  }
  const activeCount = comments.filter((comment) => !comment.deletedAt).length;

  function renderComment(comment: CommentRecord) {
    const action = activeAction?.id === comment._id ? activeAction.kind : null;
    const replies = children.get(comment._id) || [];
    return <div key={comment._id} className="yt-comment-node">
      <article className="yt-comment-item">
        <CommentAvatar name={comment.author.name} image={comment.author.image} />
        <div className="yt-comment-main">
          <div className="yt-comment-byline"><strong>{comment.author.name}</strong>{comment.author.username && <span>@{comment.author.username}</span>}<time dateTime={comment.createdAt}>{formatDistanceToNow(new Date(comment.createdAt))} ago <span>· {timeLabel(comment.createdAt)}</span></time>{comment.editedAt && !comment.deletedAt && <span>· Edited</span>}</div>
          <p className="yt-comment-location"><MapPin aria-hidden="true" />{comment.author.location || "Location not shared"}</p>
          {comment.deletedAt ? <p className="yt-comment-deleted">Comment deleted</p> : <CommentBody body={comment.commentbody || ""} mentions={comment.mentions || []} />}
          {!comment.deletedAt && translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === (user?.preferredLanguage || "en") && <div className="yt-comment-translation"><strong>{languageNames[translations[comment._id].language]} translation · local model</strong><p>{translations[comment._id].text}</p></div>}
          {translationError[comment._id] && <p role="alert" className="yt-comment-error">{translationError[comment._id]}</p>}
          <div className="yt-comment-actions">
            {!comment.deletedAt && <><button type="button" className="yt-comment-reaction" aria-label={`Like comment by ${comment.author.name}`} aria-pressed={comment.viewerReaction === "like"} disabled={busy} onClick={() => void react(comment, "like")}><ThumbsUp aria-hidden="true" />{comment.likes}</button><button type="button" className="yt-comment-reaction" aria-label={`Dislike comment by ${comment.author.name}`} aria-pressed={comment.viewerReaction === "dislike"} disabled={busy} onClick={() => void react(comment, "dislike")}><ThumbsDown aria-hidden="true" />{comment.dislikes}</button></>}
            <button type="button" onClick={() => openAction("reply", comment)}>Reply</button>
            {comment.canEdit && <><button type="button" onClick={() => openAction("edit", comment)}><Pencil aria-hidden="true" />Edit</button><button type="button" onClick={() => openAction("delete", comment)}><Trash2 aria-hidden="true" />Delete</button></>}
            {comment.author._id === user?._id && comment.revision > 1 && <button type="button" onClick={() => void toggleHistory(comment)}><History aria-hidden="true" />History</button>}
            {!comment.deletedAt && <button type="button" disabled={translatingId === comment._id} onClick={() => void translate(comment)}><Languages aria-hidden="true" />{translatingId === comment._id ? "Translating…" : translations[comment._id]?.revision === comment.revision && translations[comment._id]?.language === (user?.preferredLanguage || "en") ? "Hide translation" : `Translate to ${languageNames[user?.preferredLanguage || "en"]}`}</button>}
            {!comment.deletedAt && comment.author._id !== user?._id && (reportedIds.has(comment._id) || comment.viewerReported ? <span className="yt-comment-reported">Reported for review</span> : <button type="button" onClick={() => { setReportingId(comment._id); setReportReason("spam"); }}><Flag aria-hidden="true" />Report</button>)}
          </div>
          {reportingId === comment._id && <div className="yt-comment-report"><label htmlFor={`report-reason-${comment._id}`}>Why report this comment?</label><select id={`report-reason-${comment._id}`} value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="offensive">Offensive content</option></select><button type="button" className="yt-primary-button" disabled={busy} onClick={() => void sendReport(comment)}>Send report</button><button type="button" className="yt-comment-cancel" onClick={() => setReportingId(null)}>Cancel</button></div>}
          {(action === "reply" || action === "edit") && <div className="yt-comment-inline-editor"><MentionEditor id={`comment-action-${comment._id}`} value={actionText} onChange={setActionText} placeholder={action === "reply" ? `Reply to ${comment.author.name}` : "Edit your comment"} />{action === "reply" && challengeField(comment._id)}<div className="yt-comment-editor-footer"><span>{commentLength(actionText)} / {maxCommentLength} · Type @ to mention</span><div><button type="button" className="yt-comment-cancel" disabled={busy} onClick={() => setActiveAction(null)}>Cancel</button><button type="button" className="yt-primary-button" disabled={busy || !commentLength(actionText) || commentLength(actionText) > maxCommentLength} onClick={() => action === "reply" ? void postComment(comment._id) : void editComment(comment)}>{busy ? "Saving…" : action === "reply" ? "Post reply" : "Save changes"}</button></div></div></div>}
          {action === "delete" && <div className="yt-comment-confirm"><p>Delete this comment? Replies will stay visible.</p><div><button type="button" className="yt-comment-cancel" disabled={busy} onClick={() => setActiveAction(null)}>Cancel</button><button type="button" className="yt-primary-button" disabled={busy} onClick={() => void deleteComment(comment)}>{busy ? "Deleting…" : "Delete comment"}</button></div></div>}
          {historyId === comment._id && <div className="yt-comment-history"><strong>Your comment history</strong>{historyLoading ? <p>Loading history…</p> : <ol>{historyEntries.map((entry) => <li key={entry.revision}><span>{entry.action} · {timeLabel(entry.changedAt)}</span>{!["deleted", "moderated"].includes(entry.action) && <p>{entry.commentbody}</p>}</li>)}</ol>}</div>}
        </div>
      </article>
      {replies.length > 0 && <div className="yt-comment-replies">{replies.map(renderComment)}</div>}
    </div>;
  }

  return <section className="yt-comments" aria-labelledby="comments-heading">
    <div className="yt-comments-heading"><div><h2 id="comments-heading"><MessageCircle aria-hidden="true" />{activeCount} {activeCount === 1 ? "comment" : "comments"}</h2></div><label className="yt-comments-sort">Sort by <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="liked">Most liked</option><option value="relevant">Most relevant</option></select></label></div>
    <p className="yt-comments-note"><Clock3 aria-hidden="true" /> Edit or delete your comments within {editWindowMinutes} minutes.</p>
    <div className="yt-comment-profile-bar"><span>Posting as <strong>@{user?.username || "member"}</strong></span><button type="button" onClick={openProfile}>Edit comment profile</button></div>
    {profileOpen && <div className="yt-comment-profile"><div><strong>Your comment profile</strong><p>Location is self-reported. Your picture is stored in MongoDB Atlas.</p></div><div className="yt-comment-profile-picture"><CommentAvatar name={user?.name || "You"} image={profileImage === undefined ? user?.image : profileImage} /><label><ImagePlus aria-hidden="true" />Choose picture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void choosePicture(event.target.files?.[0])} className="sr-only" /></label><button type="button" onClick={() => setProfileImage(null)}>Remove picture</button></div><div className="yt-comment-profile-fields"><label>Location<input value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} maxLength={80} placeholder="e.g. Pune, India" /></label><label>Translate comments to<select value={profileLanguage} onChange={(event) => setProfileLanguage(event.target.value)}>{Object.entries(languageNames).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div>{profileError && <p role="alert" className="yt-comment-error">{profileError}</p>}<div className="yt-comment-profile-actions"><button type="button" className="yt-comment-cancel" disabled={profileBusy} onClick={() => setProfileOpen(false)}>Cancel</button><button type="button" className="yt-primary-button" disabled={profileBusy} onClick={() => void saveProfile()}>{profileBusy ? "Saving…" : "Save profile"}</button></div></div>}
    <div className="yt-comments-composer"><CommentAvatar name={user?.name || "You"} image={user?.image} /><div><MentionEditor id="new-comment" value={rootText} onChange={setRootText} placeholder="Add a comment" />{challengeField(null)}<div className="yt-comment-editor-footer"><span>{commentLength(rootText)} / {maxCommentLength} · Type @ to mention</span><div>{rootText && <button type="button" className="yt-comment-cancel" disabled={busy} onClick={() => setRootText("")}>Cancel</button>}<button type="button" className="yt-primary-button" disabled={busy || !commentLength(rootText) || commentLength(rootText) > maxCommentLength} onClick={() => void postComment(null)}><Send aria-hidden="true" />{busy ? "Posting…" : "Comment"}</button></div></div></div></div>
    {error && <p role="alert" className="yt-comment-error">{error}</p>}
    {loading ? <p className="yt-comment-loading">Loading comments…</p> : comments.length === 0 && !error ? <p className="yt-comment-empty">No comments yet. Start the conversation.</p> : <div className="yt-comment-list">{(children.get(null) || []).map(renderComment)}</div>}
  </section>;
}
