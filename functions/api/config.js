export async function onRequestGet({ env }) {
  if (!env.GRADUATION_KV) {
    return Response.json({ error: "KV binding is missing" }, { status: 500 });
  }

  const raw = await env.GRADUATION_KV.get("site_config");
  if (!raw) {
    return new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  // 公開GETリクエストにはパスコードを含めない
  const parsed = JSON.parse(raw);
  delete parsed.passcode;

  return new Response(JSON.stringify(parsed), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.GRADUATION_KV) {
    return Response.json({ error: "KV binding is missing" }, { status: 500 });
  }

  const body = await request.json();
  const currentRaw = await env.GRADUATION_KV.get("site_config");
  const currentData = currentRaw ? JSON.parse(currentRaw) : {};
  const validPasscode = currentData.passcode || "takikawa2026";

  if (body.passcode !== validPasscode) {
    return Response.json({ error: "パスコードが正しくありません" }, { status: 401 });
  }

  const nextData = {
    ...body.config,
    passcode: body.config.passcode || validPasscode,
    updatedAt: new Date().toISOString()
  };

  await env.GRADUATION_KV.put("site_config", JSON.stringify(nextData));

  return Response.json({ ok: true, updatedAt: nextData.updatedAt });
}
