import Comment from "../Modals/comments.js";
import CommentTranslation from "../Modals/CommentTranslation.js";

const languages = { en: "English", hi: "Hindi", es: "Spanish" };

export function getTranslationLanguages(_request, response) {
  return response.json({ languages });
}

export async function translateComment(request, response) {
  if (!/^[a-f\d]{24}$/i.test(request.params.id)) return response.status(404).json({ message: "Comment not found." });
  const language = request.body?.targetLanguage ?? request.user.preferredLanguage ?? "en";
  if (!Object.hasOwn(languages, language)) return response.status(400).json({ message: "Choose English, Hindi or Spanish." });

  try {
    const comment = await Comment.findById(request.params.id).select("commentbody deletedAt revision");
    if (!comment) return response.status(404).json({ message: "Comment not found." });
    if (comment.deletedAt) return response.status(409).json({ message: "Deleted comments cannot be translated." });
    const revision = comment.revision || 1;
    const cached = await CommentTranslation.findOne({ commentId: comment._id, revision, language }).lean();
    if (cached) return response.json({ text: cached.text, language, revision, cached: true });

    const configuredPort = Number(process.env.COMMENT_TRANSLATE_PORT);
    const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536 ? configuredPort : 5001;
    let upstream;
    try {
      upstream = await fetch(`http://127.0.0.1:${port}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: comment.commentbody, source: "auto", target: language, format: "text" }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return response.status(503).json({ message: "Local translation is unavailable. The original comment is still visible." });
    }
    if (!upstream.ok) return response.status(503).json({ message: "Local translation could not process this comment. The original is still visible." });
    const result = await upstream.json().catch(() => null);
    if (typeof result?.translatedText !== "string" || !result.translatedText.trim()) {
      return response.status(503).json({ message: "Local translation returned no text. The original is still visible." });
    }

    const current = await Comment.findById(comment._id).select("revision deletedAt");
    if (!current || current.deletedAt || (current.revision || 1) !== revision) {
      return response.status(409).json({ message: "The comment changed while translating. Refresh and try again." });
    }
    await CommentTranslation.updateOne(
      { commentId: comment._id, revision, language },
      { $setOnInsert: { text: result.translatedText } },
      { upsert: true },
    ).catch((error) => { if (error.code !== 11000) throw error; });
    return response.json({ text: result.translatedText, language, revision, cached: false });
  } catch (error) {
    console.error("Could not translate comment:", error);
    return response.status(500).json({ message: "Could not translate comment." });
  }
}
