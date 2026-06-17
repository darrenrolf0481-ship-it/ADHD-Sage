async function test() {
  const apiKey = 'REDACTED';
  try {
    console.log('Testing OpenRouter connection with Gemma...');
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemma-4-31b-it:free',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const data = (await res.json()) as any;
    console.log('OpenRouter Response Status:', res.status);
    console.log('OpenRouter Response Data:', JSON.stringify(data));
  } catch (e: any) {
    console.log('❌ Failed OpenRouter:', e.message);
  }
}
test();
