const DEFAULT_USERS = [
  { id: "system_administrator", password: "RMYh2411", label: "システム管理者" }
];

function getUsers(data) {
  if (Array.isArray(data.adminUsers) && data.adminUsers.length > 0) {
    return data.adminUsers;
  }
  return DEFAULT_USERS;
}

function authenticate(users, userId, password) {
  if (!userId || !password) return null;
  return users.find(u => u.id === userId && u.password === password) || null;
}

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

  const parsed = JSON.parse(raw);
  delete parsed.passcode;
  delete parsed.adminUsers;

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
  const users = getUsers(currentData);

  const authUser = authenticate(users, body.userId, body.password);
  if (!authUser) {
    return Response.json({ error: "ユーザーIDまたはパスワードが正しくありません" }, { status: 401 });
  }

  if (body.action === "login") {
    const safeUsers = users.map(u => ({ id: u.id, label: u.label || u.id }));
    return Response.json({
      ok: true,
      currentUser: { id: authUser.id, label: authUser.label || authUser.id },
      users: safeUsers
    });
  }

  if (body.action === "manage_users") {
    let nextUsers = [...users];

    if (body.subAction === "add") {
      const newId = String(body.newUserId || "").trim();
      const newPass = String(body.newPassword || "").trim();
      const newLabel = String(body.newLabel || "").trim() || newId;

      if (!newId || !newPass) {
        return Response.json({ error: "ユーザーIDとパスワードを入力してください" }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(newId)) {
        return Response.json({ error: "ユーザーIDは半角英数字・記号（._-）のみ使用できます" }, { status: 400 });
      }
      if (nextUsers.some(u => u.id === newId)) {
        return Response.json({ error: "このユーザーIDはすでに登録されています" }, { status: 400 });
      }

      nextUsers.push({ id: newId, password: newPass, label: newLabel });
    } else if (body.subAction === "delete") {
      const targetId = String(body.targetUserId || "");
      if (nextUsers.length <= 1) {
        return Response.json({ error: "最後の管理者アカウントは削除できません" }, { status: 400 });
      }
      nextUsers = nextUsers.filter(u => u.id !== targetId);
    } else if (body.subAction === "change_password") {
      const targetId = String(body.targetUserId || "");
      const newPass = String(body.newPassword || "").trim();
      if (!newPass) {
        return Response.json({ error: "新しいパスワードを入力してください" }, { status: 400 });
      }
      nextUsers = nextUsers.map(u => (u.id === targetId ? { ...u, password: newPass } : u));
    }

    const updatedData = {
      ...currentData,
      adminUsers: nextUsers,
      updatedAt: new Date().toISOString()
    };
    delete updatedData.passcode;

    await env.GRADUATION_KV.put("site_config", JSON.stringify(updatedData));

    const safeUsers = nextUsers.map(u => ({ id: u.id, label: u.label || u.id }));
    return Response.json({ ok: true, users: safeUsers });
  }

  const nextConfig = {
    ...body.config,
    adminUsers: users,
    updatedAt: new Date().toISOString()
  };
  delete nextConfig.passcode;

  await env.GRADUATION_KV.put("site_config", JSON.stringify(nextConfig));

  return Response.json({ ok: true, updatedAt: nextConfig.updatedAt });
}
