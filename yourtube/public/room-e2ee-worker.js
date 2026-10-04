// The room secret arrives from the URL fragment, which is never sent to the API.
self.addEventListener("rtctransform", (event) => {
  const { direction, key: rawKey, media } = event.transformer.options;
  const clearBytes = media === "video" ? 10 : 0;
  const keyPromise = crypto.subtle.importKey("raw", new Uint8Array(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
  const transform = new TransformStream({
    async transform(frame, controller) {
      try {
        const data = new Uint8Array(frame.data);
        const prefixLength = Math.min(clearBytes, data.length);
        const prefix = data.slice(0, prefixLength);
        const key = await keyPromise;
        if (direction === "encrypt") {
          const nonce = crypto.getRandomValues(new Uint8Array(12));
          const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: prefix }, key, data.slice(prefixLength)));
          const output = new Uint8Array(prefixLength + nonce.length + encrypted.length);
          output.set(prefix);
          output.set(nonce, prefixLength);
          output.set(encrypted, prefixLength + nonce.length);
          frame.data = output.buffer;
        } else {
          if (data.length < prefixLength + 28) return;
          const nonce = data.slice(prefixLength, prefixLength + 12);
          const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: prefix }, key, data.slice(prefixLength + 12)));
          const output = new Uint8Array(prefixLength + plaintext.length);
          output.set(prefix);
          output.set(plaintext, prefixLength);
          frame.data = output.buffer;
        }
        controller.enqueue(frame);
      } catch { /* A wrong room key or malformed frame must never be played. */ }
    },
  });
  event.transformer.readable.pipeThrough(transform).pipeTo(event.transformer.writable).catch(() => {});
});
