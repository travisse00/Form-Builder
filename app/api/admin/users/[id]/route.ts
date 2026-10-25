import { requireAdmin } from "@/lib/admin";
import { logError } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["suspend", "reactivate", "make_admin", "remove_admin"] as const;
type Action = (typeof ACTIONS)[number];

const reply = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user: me, email: myEmail } = auth;

  const { id } = await params;
  if (!UUID.test(id)) return reply("Invalid user.");

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (!body?.action || !ACTIONS.includes(body.action as Action)) return reply("Invalid action.");
  const action = body.action as Action;

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, role, is_suspended")
    .eq("id", id)
    .maybeSingle();
  if (!target) return reply("User not found.", 404);

  // Safety rules, so nobody locks everyone out
  if (action === "suspend") {
    if (id === me.id) return reply("You can't suspend your own account.");
    if (target.role === "admin") return reply("Remove this user's admin access before suspending them.");
    if (target.is_suspended) return reply("This account is already suspended.");
  }
  if (action === "reactivate" && !target.is_suspended) return reply("This account is already active.");
  if (action === "make_admin") {
    if (target.role === "admin") return reply("Already an admin.");
    if (target.is_suspended) return reply("Reactivate this account first.");
  }
  if (action === "remove_admin") {
    if (id === me.id) return reply("You can't remove your own admin access.");
    if (target.role !== "admin") return reply("This user isn't an admin.");
  }

  if (action === "suspend") {
    const { error: e1 } = await admin.from("profiles").update({ is_suspended: true }).eq("id", id);
    if (e1) return reply("Couldn't suspend the account.", 500);

    // also block sign-in at the auth level (about 100 years)
    const { error: e2 } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (e2) {
      await admin.from("profiles").update({ is_suspended: false }).eq("id", id);
      await logError("admin", `Suspend failed: ${e2.message}`, { target: id });
      return reply("Couldn't block sign-in, so nothing was changed.", 500);
    }
  } else if (action === "reactivate") {
    const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
    if (e1) {
      await logError("admin", `Reactivate failed: ${e1.message}`, { target: id });
      return reply("Couldn't restore sign-in.", 500);
    }
    const { error: e2 } = await admin.from("profiles").update({ is_suspended: false }).eq("id", id);
    if (e2) return reply("Couldn't reactivate the account.", 500);
  } else {
    const role = action === "make_admin" ? "admin" : "user";
    const { error } = await admin.from("profiles").update({ role }).eq("id", id);
    if (error) return reply("Couldn't change the role.", 500);
  }

  await admin.from("admin_audit_log").insert({
    admin_id: me.id,
    admin_email: myEmail,
    action,
    target_id: id,
    target_email: target.email,
  });

  const messages: Record<Action, string> = {
    suspend: "Account suspended.",
    reactivate: "Account reactivated.",
    make_admin: "Admin access granted.",
    remove_admin: "Admin access removed.",
  };
  return Response.json({ ok: true, message: messages[action] });
}