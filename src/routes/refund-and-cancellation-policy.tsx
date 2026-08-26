import { APP_URL } from "@/lib/constants";
import { PolicyPage } from "@/components/legal/PolicyPage";

const title = "Refund and Cancellation Policy";
const path = "/refund-and-cancellation-policy";
const description = "Refund and cancellation policy for purchases made through the IEEE Sahrdaya platform.";

export const meta = () => [
  { title: `${title} | IEEE Sahrdaya Student Branch` },
  { name: "description", content: description },
  { property: "og:title", content: `${title} | IEEE Sahrdaya Student Branch` },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}${path}` },
];

const intro = [
  "This refund and cancellation policy outlines how you can cancel or seek a refund for a product / service that you have purchased through the Platform. Under this policy:",
];

const items = [
  "Cancellations will only be considered if the request is made 2 days of placing the order. However, cancellation requests may not be entertained if the orders have been communicated to such sellers / merchant(s) listed on the Platform and they have initiated the process of shipping them, or the product is out for delivery. In such an event, you may choose to reject the product at the doorstep.",
  "Sourav P Bijoy does not accept cancellation requests for perishable items like flowers, eatables, etc. However, the refund / replacement can be made if the user establishes that the quality of the product delivered is not good.",
  "In case of receipt of damaged or defective items, please report to our customer service team. The request would be entertained once the seller/ merchant listed on the Platform, has checked and determined the same at its own end. This should be reported within 2 days of receipt of products. In case you feel that the product received is not as shown on the site or as per your expectations, you must bring it to the notice of our customer service within 2 days of receiving the product. The customer service team after looking into your complaint will take an appropriate decision.",
  "In case of complaints regarding the products that come with a warranty from the manufacturers, please refer the issue to them.",
  "In case of any refunds approved by Sourav P Bijoy, it will take 7 days for the refund to be processed to you.",
];

export default function RefundAndCancellationPolicyPage() {
  return <PolicyPage title={title} path={path} intro={intro} sections={[{ items }]} />;
}
