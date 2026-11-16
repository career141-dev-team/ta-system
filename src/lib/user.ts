// Placeholder until sign-in is wired: the person shown in the owner's designs.
export const USER = { name: "Chathura Sampath", role: "Talent Acquisition" };

/** May this person see Headhunting? The old system lets only someone with a
 *  sourcing seat on the opening in (`requireSourcingSeat`); a client never. A
 *  placeholder until sign-in, like CAN_ACT elsewhere. Without it the Headhunting
 *  rows, the bar's Headhunting switch and every hh- view are gone. */
export const CAN_SOURCE: boolean = true;

/** A TA sees their own headhunting numbers; a lead or admin sees the whole job's. */
export const SEES_WHOLE_JOB = USER.role !== "Talent Acquisition";


/** Feedback & support: a TA Lead or Director reviews feedback on the board, an Admin
 *  works the builders' column (old system's FeedbackDesk). Placeholder until sign-in:
 *  on, so the board and its buttons can be seen. */
export const REVIEWS_FEEDBACK: boolean = true;
