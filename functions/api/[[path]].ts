export const onRequestGet: PagesFunction = async ({ params, request }) => {
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");

  const payload = {
    ok: true,
    route: `/api/${path}`.replace(/\/$/, ""),
    method: "GET",
    query: Object.fromEntries(url.searchParams.entries()),
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};

export const onRequestPost: PagesFunction = async ({ params, request }) => {
  const url = new URL(request.url);
  const path = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  let body: unknown = null;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const payload = {
    ok: true,
    route: `/api/${path}`.replace(/\/$/, ""),
    method: "POST",
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};