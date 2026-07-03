import { Plus, X, Copy } from "lucide-react";
import type { Coupon } from "@/types";

function generateId() {
  return crypto.randomUUID();
}

interface CouponManagerProps {
  coupons: Coupon[];
  onChange: (coupons: Coupon[]) => void;
}

/**
 * Coupon manager for event registration discounts.
 * Add/edit/remove coupons with code, discount %, max uses, expiry, and active toggle.
 */
export function CouponManager({ coupons, onChange }: CouponManagerProps) {
  const addCoupon = () => {
    const newCoupon: Coupon = {
      id: generateId(),
      event: "",
      code: "",
      discountPercent: 0,
      maxUses: 0,
      usedCount: 0,
      isActive: true,
    };
    onChange([...coupons, newCoupon]);
  };

  const removeCoupon = (id: string) => {
    onChange(coupons.filter((c) => c.id !== id));
  };

  const updateCoupon = (id: string, updates: Partial<Coupon>) => {
    onChange(
      coupons.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  return (
    <div className="space-y-3">
      {coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No coupons yet. Add discount codes for your event.
        </p>
      ) : (
        coupons.map((coupon) => (
          <div
            key={coupon.id}
            className="rounded-lg border border-border/50 p-3 space-y-2"
          >
            {/* Code row */}
            <div className="flex items-center gap-2">
              <input
                value={coupon.code}
                onChange={(e) =>
                  updateCoupon(coupon.id, {
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="COUPON CODE"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono uppercase outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(coupon.code)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title={`Copy ${coupon.code}`}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeCoupon(coupon.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Discount + limits */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Discount %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={coupon.discountPercent}
                  onChange={(e) =>
                    updateCoupon(coupon.id, {
                      discountPercent: Number(e.target.value),
                    })
                  }
                  placeholder="10"
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Max Uses
                </label>
                <input
                  type="number"
                  min="0"
                  value={coupon.maxUses}
                  onChange={(e) =>
                    updateCoupon(coupon.id, {
                      maxUses: Number(e.target.value),
                    })
                  }
                  placeholder="0 = unlimited"
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Expires
                </label>
                <input
                  type="datetime-local"
                  value={
                    coupon.expiresAt
                      ? coupon.expiresAt.substring(0, 16)
                      : ""
                  }
                  onChange={(e) => {
                    if (!e.target.value) {
                      updateCoupon(coupon.id, { expiresAt: "" });
                      return;
                    }
                    updateCoupon(coupon.id, {
                      expiresAt: new Date(e.target.value).toISOString(),
                    });
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-1">
                  <input
                    type="checkbox"
                    checked={coupon.isActive}
                    onChange={(e) =>
                      updateCoupon(coupon.id, {
                        isActive: e.target.checked,
                      })
                    }
                    className="rounded border-input"
                  />
                  <span className="text-xs text-muted-foreground">Active</span>
                </label>
              </div>
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={addCoupon}
        className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-2.5 py-1.5 text-xs font-medium transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Coupon
      </button>
    </div>
  );
}
