const abusiveWords = /\b(?:fuck(?:ing|er)?|shit(?:ty)?|bitch(?:es)?|bastard|asshole|motherfucker|madarchod|behenchod|chutiya|puta|putain|merde)\b|(?:मादरचोद|बहनचोद|चूतिया|مادرچود|بہنچود)/iu;
const obfuscatedAbuse = /(?<!\p{L})(?:f[._*\s]*u[._*\s]*c[._*\s]*k|s[._*\s]*h[._*\s]*i[._*\s]*t|b[._*\s]*i[._*\s]*t[._*\s]*c[._*\s]*h)(?!\p{L})/iu;
const link = /(?:\b(?:https?:\/\/|ftp:\/\/|www\.)\S*|\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/\S*)?|\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:\/\S*)?)/iu;
const zeroWidth = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;

export function normalizedComment(body) {
  return body.normalize("NFKC").replace(zeroWidth, "").toLocaleLowerCase("en");
}

export function commentFingerprint(body) {
  return normalizedComment(body)
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}@]+/gu, " ").trim().replace(/\s+/gu, " ");
}

export function commentSafetyError(body) {
  const normalized = normalizedComment(body);
  if (abusiveWords.test(normalized) || obfuscatedAbuse.test(normalized)) return "Please remove abusive language before posting.";
  if (link.test(normalized)) return "Links are not allowed in comments.";

  const characters = Array.from(normalized);
  let repeated = 1;
  for (let index = 1; index < characters.length; index += 1) {
    repeated = characters[index] === characters[index - 1] ? repeated + 1 : 1;
    if (repeated >= 8 && /[\p{Extended_Pictographic}!?#@$%*&]/u.test(characters[index])) {
      return "Please remove repeated emoji or special characters.";
    }
  }

  const symbols = characters.filter((character) => /[\p{Extended_Pictographic}!?#@$%*&]/u.test(character));
  if (symbols.length > 16 && symbols.length > characters.length * 0.5) {
    return "Please use fewer emoji or special characters.";
  }
  if ((normalized.match(/@(?=[a-z0-9])/gu) || []).length > 8) return "Please mention fewer people in one comment.";

  const words = normalized.match(/[\p{L}\p{N}]{2,}/gu) || [];
  for (let index = 3; index < words.length; index += 1) {
    if (words[index] === words[index - 1] && words[index] === words[index - 2] && words[index] === words[index - 3]) {
      return "Please remove repeated words.";
    }
  }
  if (characters.length > 60 && words.length <= 2 && symbols.length > 20) return "Please write a meaningful comment.";
  return null;
}
