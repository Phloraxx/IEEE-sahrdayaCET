'use client'

import { useState } from 'react'
import { Plus, X, Copy } from 'lucide-react'
import type { Coupon } from '@/types'

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

interface CouponManagerProps {
  coupons: Coupon[]
  onChange: (coupons: Coupon[]) => void
}

export function CouponManager({ coupons, onChange }: CouponManagerProps) {
  const addCoupon = () => {
    const newCoupon: Coupon = {
      id: generateId(),
      code: '',
      discountType: 'percentage',
      discountValue: 0,
      maxUses: 0,
      usedCount: 0,
      isActive: true,
    }
    onChange([...coupons, newCoupon])
  }

  const removeCoupon = (id: string) => {
    onChange(coupons.filter((c) => (c.id || c.code) !== id))
  }

  const updateCoupon = (id: string, updates: Partial<Coupon>) => {
    onChange(coupons.map((c) => ((c.id || c.code) === id ? { ...c, ...updates } : c)))
  }

  return (
    <div className="space-y-3">
      {coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No coupons yet. Add discount codes for your event.
        </p>
      ) : (
        coupons.map((coupon) => (
          <div key={coupon.id} className="rounded-lg border border-border/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={coupon.code}
                onChange={(e) => updateCoupon(coupon.id || coupon.code, { code: e.target.value.toUpperCase() })}
                placeholder="COUPON CODE"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono uppercase outline-none focus:border-ring"
              />
              <button type="button" onClick={() => {
                navigator.clipboard.writeText(coupon.code)
              }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title={`Copy ${coupon.code}`}>
                <Copy className="size-3.5" />
              </button>
              <button type="button" onClick={() => removeCoupon(coupon.id || coupon.code)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                <select
                  value={coupon.discountType}
                  onChange={(e) => updateCoupon(coupon.id || coupon.code, { discountType: e.target.value as 'percentage' | 'fixed' })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed (₹)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Value</label>
                <input
                  type="number"
                  min="0"
                  value={coupon.discountValue}
                  onChange={(e) => updateCoupon(coupon.id || coupon.code, { discountValue: Number(e.target.value) })}
                  placeholder={coupon.discountType === 'percentage' ? '10' : '100'}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Max Uses</label>
                <input
                  type="number"
                  min="0"
                  value={coupon.maxUses}
                  onChange={(e) => updateCoupon(coupon.id || coupon.code, { maxUses: Number(e.target.value) })}
                  placeholder="0 = unlimited"
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Expires</label>
                <input
                  type="datetime-local"
                  value={coupon.expiresAt ? coupon.expiresAt.substring(0, 16) : ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      updateCoupon(coupon.id || coupon.code, { expiresAt: '' })
                      return
                    }
                    updateCoupon(coupon.id || coupon.code, { expiresAt: new Date(e.target.value).toISOString() })
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={coupon.isActive}
                onChange={(e) => updateCoupon(coupon.id || coupon.code, { isActive: e.target.checked })}
                className="rounded border-input"
              />
              <span className="text-xs text-muted-foreground">Active</span>
            </label>
          </div>
        ))
      )}

      <button type="button" onClick={addCoupon}
        className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-2.5 py-1.5 text-xs font-medium transition-colors">
        <Plus className="size-3.5" />
        Add Coupon
      </button>
    </div>
  )
}
