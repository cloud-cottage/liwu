const readErrorPayload = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return { message: 'TTS 服务调用失败。' };
};

export async function synthesizeSpeech(text) {
  const response = await fetch('/api/tts-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const errorPayload = await readErrorPayload(response);
    const error = new Error(errorPayload.userMessage || errorPayload.message || 'TTS 服务调用失败。');
    error.code = errorPayload.error || '';
    error.userMessage = errorPayload.userMessage || error.message;
    throw error;
  }

  return URL.createObjectURL(await response.blob());
}

export async function blobUrlToFile(blobUrl, filename) {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: 'audio/mp3' });
}
