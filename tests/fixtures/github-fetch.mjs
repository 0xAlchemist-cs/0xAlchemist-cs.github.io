// Preloaded only by the isolated sync CLI test; never contact the network.
globalThis.fetch = async (url) => {
  const name = new URL(url).pathname.replace('/repos/', '');
  if (name === 'owner/second') return new Response('', { status: 429 });
  if (name !== 'owner/public') throw new Error('Unexpected fixture request');
  return Response.json({
    full_name: name,
    html_url: `https://github.com/${name}`,
    private: false,
    description: 'Updated public description',
    language: 'TypeScript',
    topics: [],
    stargazers_count: 4,
    updated_at: '2026-10-20T00:00:00Z',
  });
};
