import { createFileRoute } from "@tanstack/react-router";
import { createPB } from "@/lib/pb.server"
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { verifySameOrigin } from "@/lib/verify-same-origin";
import { FifaSettingsSchema } from "@/schemas/fifa";
import { getField } from "@/lib/safe-get";

// Admin-only: GET (read settings) + PATCH (update settings).
// The settings page used to read/write /pb directly, which bypassed the
// app-layer requireRole(['admin']) check and relied solely on PB rules.
// This route restores the repo's authenticate-at-the-app-layer pattern.
export const Route = createFileRoute("/api/admin/fifa/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          try {
            const s = await pb.collection("fifa_settings").getFirstListItem("1=1");
            return Response.json({
              settings: {
                id: getField(s, 'id', ''),
                event_name: getField(s, 'event_name', ''),
                starting_balance: getField(s, 'starting_balance', 1000),
                max_bet_percent: getField(s, 'max_bet_percent', 25),
                daily_topup_threshold: getField(s, 'daily_topup_threshold', 100),
                daily_topup_target: getField(s, 'daily_topup_target', 200),
                pool_house_cut_percent: getField(s, 'pool_house_cut_percent', 0),
                raffle_tickets_base: getField(s, 'raffle_tickets_base', 50),
                raffle_tickets_decay: getField(s, 'raffle_tickets_decay', 2),
                raffle_active_participant_min_bets: getField(s, 'raffle_active_participant_min_bets', 1),
                prize: getField(s, 'prize', ''),
                registration_open: getField(s, 'registration_open', true),
              },
            });
          } catch {
            return Response.json({ error: 'Settings not seeded — run migrate:game-backfill' }, { status: 404 });
          }
        } catch (error) {
          return handleError(error, "admin-fifa-settings-get");
        }
      },
      PATCH: async ({ request }) => {
        try {
          verifySameOrigin(request);
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const parsed = FifaSettingsSchema.partial().parse(await request.json());
          // Find the single settings row and patch it
          const s = await pb.collection("fifa_settings").getFirstListItem("1=1");
          await pb.collection("fifa_settings").update(s.id, parsed);
          return Response.json({ success: true });
        } catch (error) {
          return handleError(error, "admin-fifa-settings-update");
        }
      },
    },
  },
});
