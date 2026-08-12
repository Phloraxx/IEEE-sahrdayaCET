export interface MyEventRegistration {
  found: boolean;
  registrationId: string;
  registrationStatus: string;
  paymentStatus: string;
  amount: number;
  paymentRequired: boolean;
  ticketId: string;
  manualReview: boolean;
  reviewReason: string;
  receiptAvailable: boolean;
  eventEnded: boolean;
  ticketEmailStatus: string;
  receiptEmailStatus: string;
}

export type RegistrationAction = "register" | "payment" | "ticket" | "review" | "closed";

export function registrationAction(
  state: MyEventRegistration | null,
  registrationOpen: boolean,
): RegistrationAction {
  if (state?.found) {
    if (state.manualReview) return "review";
    if (state.paymentRequired) return "payment";
    if (state.registrationStatus === "confirmed" && state.ticketId) return "ticket";
  }
  return registrationOpen ? "register" : "closed";
}
