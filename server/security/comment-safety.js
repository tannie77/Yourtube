const abusiveWords = /\b(?:fuck|fucking|shit|bitch|bastard|asshole|motherfucker)\b|(?:मादरचोद|बहनचोद)/iu;
const link = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|xyz|ru|tk)(?:\b|\/))/iu;

export function commentSafetyError(body) {
  if (abusiveWords.test(body)) return "Please remove abusive language before posting.";
  if (link.test(body)) return "Links are not allowed in this local comment demo.";

  const characters = Array.from(body);
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

  const words = body.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  for (let index = 3; index < words.length; index += 1) {
    if (words[index] === words[index - 1] && words[index] === words[index - 2] && words[index] === words[index - 3]) {
      return "Please remove repeated words.";
    }
  }
  return null;
}
