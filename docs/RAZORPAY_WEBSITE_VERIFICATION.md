# Razorpay Website Verification — TT-20260831-003

## Reviewer request

Razorpay reported that website verification is blocked by missing or incomplete:

- About Us
- Contact Us
- Shipping & Delivery Policy
- Pricing & Catalog Listings

Razorpay's current public documentation also expects Terms & Conditions, Privacy Policy and Cancellation/Refunds to be available for website verification, so this change treats the seven pages as one compliance surface.

## Production URLs after deployment

- `https://ieeesahrdaya.com/about`
- `https://ieeesahrdaya.com/contact`
- `https://ieeesahrdaya.com/pricing`
- `https://ieeesahrdaya.com/shipping-and-delivery-policy`
- `https://ieeesahrdaya.com/terms-and-conditions`
- `https://ieeesahrdaya.com/privacy-policy`
- `https://ieeesahrdaya.com/refund-and-cancellation-policy`

## Implementation notes

- The catalog is generated from real published/completed event records and displays each recorded registration fee as `Free` or an INR amount.
- The site describes its service accurately as event registration/participation, not a physical-goods marketplace.
- Shipping policy explicitly states that no physical merchandise is currently shipped and explains electronic registration/ticket delivery.
- Refund/cancellation copy is event-specific and includes an approval/initiation timeline instead of retail-product boilerplate.
- Privacy and terms copy no longer contain placeholder grievance fields, seller/logistics language, perishable-product clauses or inaccurate company-incorporation text.
- All seven links are in the global footer and production sitemap.

## Validation before deployment

- React Router type generation: green.
- TypeScript: green.
- ESLint `src`: zero warnings.
- Focused verification test: 4/4 green.
- Full Vitest: 64 files, 360 passed, 3 expected certificate-renderer skips.
- Production client + SSR build: green.
- Local SSR: all seven URLs HTTP 200.
- Browser layout: 1440×900 and 390×844 green; no horizontal overflow; all footer links present.

## Support reply after production verification

> Hi,
>
> The requested website sections have now been updated and are publicly available on our website: About Us, Contact Us, Shipping & Delivery Policy, and Event Pricing & Catalog. We have also ensured that our Terms & Conditions, Privacy Policy, and Refund & Cancellation Policy are clearly available in the website footer.
>
> Kindly re-check the website and proceed with verification for ticket TT-20260831-003.
>
> Thank you.

Do not send this reply until the production URLs above have been checked directly after deployment.
